import type { RawChange } from '@/app/write/types';

// ```json 펜스를 붙일 때와 안 붙일 때가 섞인다. 무조건 벗겨낸다.
export function stripFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : t;
}

function coerce(value: unknown): RawChange | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.before !== 'string' || typeof v.after !== 'string') return null;
  return {
    before: v.before,
    after: v.after,
    rule_id: v.rule_id == null ? '' : String(v.rule_id),
    note: typeof v.note === 'string' ? v.note : '',
  };
}

// 실패하면 throw. 호출 쪽에서 그 문단만 재시도한다.
export function parseChanges(raw: string): RawChange[] {
  const body = stripFence(raw);
  if (body.length === 0) throw new Error('빈 응답');

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    // 앞뒤에 설명이 붙어온 경우 JSON 덩어리만 다시 긁는다
    const first = body.search(/[[{]/);
    const last = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    if (first === -1 || last <= first) throw new Error('JSON 파싱 실패');
    data = JSON.parse(body.slice(first, last + 1));
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.changes)
      ? ((data as Record<string, unknown>).changes as unknown[])
      : null;

  if (!list) throw new Error('changes 배열 없음');

  return list.map(coerce).filter((c): c is RawChange => c !== null);
}