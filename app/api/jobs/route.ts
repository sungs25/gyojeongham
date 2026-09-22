import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { sha256 } from '@/lib/hash';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// 한 번에 받는 원문 상한. 씨앗 40개 분량
const MAX_SOURCE_CHARS = 200_000;

export async function POST(request: Request) {
  // 1. 누가 요청했는지 확인
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) {
    return Response.json({ error: '로그인이 필요합니다', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  // 2. 화면과 같은 함수로 청크를 자른다
  const body = await request.json().catch(() => null);
  const raw = typeof body?.text === 'string' ? body.text : '';
  const source = cleanSource(raw);

  if (source.length > MAX_SOURCE_CHARS) {
    return Response.json({ error: '글이 너무 깁니다', code: 'TOO_LONG' }, { status: 413 });
  }

  const chunks = splitIntoChunks(source);
  if (chunks.length === 0) {
    return Response.json({ error: '빈 글입니다', code: 'EMPTY' }, { status: 400 });
  }

  // 3. 청크 지문을 등록하고 씨앗을 잡는다
  const payload = chunks.map((c) => ({ hash: sha256(c.text), chars: c.text.length }));
  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc('create_job', { p_user: userId, p_chunks: payload })
    .single<{ job_id: string; seeds: number }>();

  if (error || !data) {
    if (error?.message.includes('INSUFFICIENT_SEEDS')) {
      return Response.json({ error: '씨앗이 부족합니다', code: 'INSUFFICIENT_SEEDS' }, { status: 402 });
    }
    console.error('create_job 실패', error);
    return Response.json({ error: '작업을 만들지 못했습니다', code: 'SERVER' }, { status: 500 });
  }

  return Response.json({ jobId: data.job_id, seeds: data.seeds, chunkCount: chunks.length });
}