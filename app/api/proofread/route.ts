import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseChanges } from '@/lib/parse';
import { sha256 } from '@/lib/hash';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RawChange } from '@/app/write/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SYSTEM_PROMPT = readFileSync(
  path.join(process.cwd(), 'prompts', 'prompt-changes.txt'),
  'utf8',
);

// 프롬프트 버전: 파일 내용 지문의 앞 12자리. 프롬프트가 한 글자만 바뀌어도 달라진다
const PROMPT_VERSION = sha256(SYSTEM_PROMPT).slice(0, 12);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 개발 중 반환 흐름 확인용. 켜면 모델을 부르지 않고 실패로 처리한다
const FORCE_FAIL =
  process.env.NODE_ENV === 'development' && process.env.PROOFREAD_FORCE_FAIL === '1';

type ModelResult =
  | { ok: true; changes: RawChange[]; usage: Anthropic.Usage }
  | { ok: false; error: string; usage: Anthropic.Usage | null };

// 모델 호출 한 번. 예외를 밖으로 던지지 않고 결과로 돌려준다
async function callModel(text: string): Promise<ModelResult> {
  const params = {
    model: 'claude-opus-5',
    max_tokens: 12000,
    output_config: { effort: 'high' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: text }],
  } as unknown as Anthropic.MessageCreateParamsStreaming;

  let usage: Anthropic.Usage | null = null;
  try {
    const stream = client.messages.stream(params);
    const message = await stream.finalMessage();
    usage = message.usage;

    const raw = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // 사고가 max_tokens를 다 쓰면 본문이 0자로 온다
    if (message.stop_reason === 'max_tokens' || raw.trim().length === 0) {
      return { ok: false, error: '응답 본문이 비었습니다', usage };
    }

    return { ok: true, changes: parseChanges(raw), usage };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), usage };
  }
}

// DB에 적을 usage. 사고 토큰은 SDK 타입에 없어 따로 꺼낸다
function toUsageRow(usage: Anthropic.Usage | null) {
  const u = (usage ?? {}) as Anthropic.Usage & {
    output_tokens_details?: { thinking_tokens?: number };
  };
  return {
    input_tokens: u.input_tokens ?? 0,
    cache_creation_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    thinking_tokens: u.output_tokens_details?.thinking_tokens ?? 0,
    prompt_version: PROMPT_VERSION,
  };
}

// 변경 건수, 그리고 before가 청크 글에 없는 건수(화면에서 미매칭이 될 변경의 근사치).
// 사용자 글은 저장하지 않으므로, 남의 글에서 매칭이 얼마나 실패하는지는 이 숫자로만 본다. 실패한 호출은 null
function toCountRow(text: string, result: ModelResult) {
  if (!result.ok) return { change_count: null, unmatched_count: null };
  return {
    change_count: result.changes.length,
    unmatched_count: result.changes.filter(
      (c) => c.before.length === 0 || !text.includes(c.before),
    ).length,
  };
}

export async function POST(request: Request) {
  // 1. 누가 요청했는지 확인
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return Response.json({ error: '로그인이 필요합니다', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text : '';
  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';

  if (text.trim().length === 0 || jobId.length === 0) {
    return Response.json({ error: '잘못된 요청입니다', code: 'BAD_REQUEST' }, { status: 400 });
  }

  // 2. 이 글이 작업에 등록된 청크인지 확인하고 시도 횟수를 올린다
  const admin = createAdminClient();
  const { data: started, error: startError } = await admin
    .rpc('start_chunk', { p_user: userId, p_job: jobId, p_hash: sha256(text) })
    .single<{ idx: number | null; attempt: number | null; job_status: string }>();

  if (startError || !started) {
    const msg = startError?.message ?? '';
    if (msg.includes('CHUNK_NOT_ALLOWED')) {
      return Response.json({ error: '등록되지 않은 글입니다', code: 'CHUNK_NOT_ALLOWED' }, { status: 403 });
    }
    if (msg.includes('JOB_NOT_FOUND') || msg.includes('invalid input syntax for type uuid')) {
      return Response.json({ error: '작업을 찾을 수 없습니다', code: 'JOB_NOT_FOUND' }, { status: 404 });
    }
    console.error('start_chunk 실패', startError);
    return Response.json({ error: '서버 오류', code: 'SERVER' }, { status: 500 });
  }

  // 이미 끝났거나 반환된 작업
  if (started.idx === null) {
    return Response.json(
      { error: '끝난 작업입니다', code: 'JOB_CLOSED', jobStatus: started.job_status },
      { status: 409 },
    );
  }

  // 3. 모델 호출
  const result: ModelResult = FORCE_FAIL
    ? { ok: false, error: '강제 실패 (개발용)', usage: null }
    : await callModel(text);

  // 4. 결과와 usage를 기록한다. 전부 성공이면 commit, 3회째 실패면 release
  const { data: jobStatus, error: finishError } = await admin.rpc('finish_chunk', {
    p_user: userId,
    p_job: jobId,
    p_idx: started.idx,
    p_ok: result.ok,
    p_usage: { ...toUsageRow(result.usage), ...toCountRow(text, result) },
  });
  if (finishError) console.error('finish_chunk 실패', finishError);

  if (!result.ok) {
    return Response.json(
      { error: result.error, code: 'MODEL_FAILED', retryable: true, jobStatus },
      { status: 502 },
    );
  }

  return Response.json({ changes: result.changes, usage: result.usage, jobStatus });
}