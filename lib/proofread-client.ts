import type { RawChange } from '@/app/write/types';
import type { Usage } from '@/app/write/reducer';

const RELEASED_MESSAGE = '교정에 실패한 부분이 있어 씨앗을 돌려드렸습니다.';

// 서버가 돌려준 청크 오류.
// retryable이 false면 다시 보내도 소용없다.
// stopMessage가 있으면 남은 청크도 보내지 않고 이 문구를 띄운다.
export class ChunkError extends Error {
  retryable: boolean;
  stopMessage: string | null;

  constructor(message: string, retryable: boolean, stopMessage: string | null = null) {
    super(message);
    this.retryable = retryable;
    this.stopMessage = stopMessage;
  }
}

// 교정 시작: 서버에 작업을 만들고 씨앗을 잡는다
export async function createJob(
  source: string,
): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  try {
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: source }),
    });
    const data = await response.json().catch(() => null);

    if (response.ok && typeof data?.jobId === 'string') {
      return { ok: true, jobId: data.jobId };
    }
    if (response.status === 401) {
      return { ok: false, message: '로그인이 필요합니다. 오른쪽 위 로그인 버튼을 눌러 주세요.' };
    }
    if (response.status === 402) {
      return { ok: false, message: '씨앗이 부족합니다.' };
    }
    if (response.status === 413) {
      return { ok: false, message: '한 번에 20만 자까지 교정할 수 있습니다.' };
    }
    return { ok: false, message: data?.error ?? '교정을 시작하지 못했습니다.' };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했습니다.' };
  }
}

// 청크 하나 교정
export async function requestChunk(
  jobId: string,
  text: string,
): Promise<{ raws: RawChange[]; usage: Usage }> {
  const response = await fetch('/api/proofread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, text }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error ?? `요청 실패 (${response.status})`;
    if (response.status === 401) {
      throw new ChunkError(message, false, '로그인이 풀렸습니다. 다시 로그인한 뒤 새 글로 시작해 주세요.');
    }
    // 이 청크든 다른 청크든 3회 실패로 작업이 반환됐으면 전부 멈춘다
    if (data?.jobStatus === 'released') {
      throw new ChunkError(message, false, RELEASED_MESSAGE);
    }
    // 모델 실패(502)와 서버 오류(500)만 다시 보낸다
    throw new ChunkError(message, response.status === 502 || response.status === 500);
  }

  // 서버는 성공으로 기록했으므로 다시 보내면 거절된다
  if (!Array.isArray(data?.changes)) {
    throw new ChunkError('changes 배열이 없습니다', false);
  }

  const u = data.usage ?? {};
  return {
    raws: data.changes as RawChange[],
    usage: {
      inputTokens: u.input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      thinkingTokens: u.output_tokens_details?.thinking_tokens ?? 0,
    },
  };
}