import type { Change } from '@/app/write/types';

export type Segment =
  | { type: 'plain'; key: string; text: string }
  | { type: 'change'; key: string; change: Change };

/**
 * 원문 문자열은 절대 건드리지 않는다. 화면에 보이는 것은 전부 여기서 계산한다.
 * applied가 꺼진 변경은 plain에 흡수되어 원문 그대로 남는다.
 */
export function buildSegments(source: string, changes: Change[]): Segment[] {
  const active = changes
    .filter((c) => c.applied && c.start >= 0)
    .sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;

  for (const change of active) {
    if (change.start > cursor) {
      segments.push({ type: 'plain', key: `p${cursor}`, text: source.slice(cursor, change.start) });
    }
    segments.push({ type: 'change', key: change.id, change });
    cursor = change.end;
  }

  if (cursor < source.length) {
    segments.push({ type: 'plain', key: `p${cursor}`, text: source.slice(cursor) });
  }

  return segments;
}

/** 교정본 전문. 복사 3종이 전부 이 함수 위에 올라간다. */
export function applyChanges(source: string, changes: Change[]): string {
  return buildSegments(source, changes)
    .map((s) => (s.type === 'plain' ? s.text : s.change.after))
    .join('');
}