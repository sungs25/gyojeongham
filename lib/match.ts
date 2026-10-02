import type { Change, Chunk, RawChange } from '@/app/write/types';
import { parseRuleIds } from '@/lib/rules';

export type MatchResult = {
  matched: Change[];
  unmatched: Change[];
};

/**
 * 모델이 준 before를 그 청크가 담고 있는 문단들 안에서 찾아 원문 오프셋을 붙인다.
 * 청크의 text는 문단을 \n\n으로 다시 이은 것이라 원문과 다르다.
 * 그래서 청크 전체가 아니라 문단 하나하나를 뒤진다.
 */
export function matchChunkChanges(
  source: string,
  chunk: Chunk,
  raws: RawChange[],
): MatchResult {
  const matched: Change[] = [];
  const unmatched: Change[] = [];

  // 문단별로 "여기까지 찾았다" 위치를 따로 기억한다.
  const cursors = chunk.paras.map((p) => p.start);

  raws.forEach((raw, i) => {
    const base = {
      id: `${chunk.index}-${i}`,
      before: raw.before,
      after: raw.after,
      ruleIds: parseRuleIds(raw.rule_id),
      note: raw.note,
      applied: true,
    };

    if (raw.before.length === 0) {
      unmatched.push({ ...base, start: -1, end: -1 });
      return;
    }

    let found = -1;
    let foundPara = -1;

    // 커서 뒤에서 먼저 찾는다
    for (let p = 0; p < chunk.paras.length; p += 1) {
      const para = chunk.paras[p];
      const idx = source.indexOf(raw.before, cursors[p]);
      if (idx !== -1 && idx + raw.before.length <= para.end) {
        found = idx;
        foundPara = p;
        break;
      }
    }

    // 못 찾으면 각 문단 처음부터 다시 (모델이 순서를 뒤집어 줄 때가 있다)
    if (found === -1) {
      for (let p = 0; p < chunk.paras.length; p += 1) {
        const para = chunk.paras[p];
        const idx = source.indexOf(raw.before, para.start);
        if (idx !== -1 && idx + raw.before.length <= para.end) {
          found = idx;
          foundPara = p;
          break;
        }
      }
    }

    if (found === -1) {
      unmatched.push({ ...base, start: -1, end: -1 });
      return;
    }

    // 원문에 이미 있는 글자를 "빠졌다"며 다시 붙이는 변경은 버린다.
    // 예: 원문 ‘바둑’은 에서 모델이 before를 바둑’은 으로 잡고 after를 ‘바둑’은 으로 주면
    //     그대로 적용할 때 ‘‘바둑’은 이 된다
    if (addsExistingText(source, found, raw.before, raw.after)) {
      unmatched.push({ ...base, start: -1, end: -1 });
      return;
    }

    matched.push({ ...base, start: found, end: found + raw.before.length });
    cursors[foundPara] = found + raw.before.length;
  });

  return { matched, unmatched };
}

// after가 before 앞이나 뒤에 글자를 덧붙인 것뿐인데, 그 글자가 원문의 바로 그 자리에 이미 있으면 true
function addsExistingText(source: string, start: number, before: string, after: string): boolean {
  if (after.length <= before.length) return false;
  const end = start + before.length;
  if (after.endsWith(before)) {
    const added = after.slice(0, after.length - before.length);
    if (source.slice(start - added.length, start) === added) return true;
  }
  if (after.startsWith(before)) {
    const added = after.slice(before.length);
    if (source.slice(end, end + added.length) === added) return true;
  }
  return false;
}

/**
 * 겹치는 변경을 정리한다. 앞선 것을 살리고 겹치는 뒷것은 내린다.
 * 같은 자리에서 시작하면 긴 쪽을 살린다.
 */
export function resolveOverlaps(changes: Change[]): MatchResult {
  const sorted = [...changes].sort((a, b) => a.start - b.start || b.end - a.end);
  const matched: Change[] = [];
  const unmatched: Change[] = [];
  let lastEnd = -1;

  for (const c of sorted) {
    if (c.start >= lastEnd) {
      matched.push(c);
      lastEnd = c.end;
    } else {
      unmatched.push({ ...c, start: -1, end: -1 });
    }
  }

  return { matched, unmatched };
}