import type { Change } from '@/app/write/types';
import { ruleName, UNCLASSIFIED } from '@/lib/rules';

export type Axis = {
  id: number;
  name: string;
  changes: Change[];
  revertedCount: number;
};

// 한 변경이 여러 축에 속하면 각 축에 모두 들어간다.
// 순서: 규칙 번호 오름차순, 분류 없음은 맨 뒤. 축 안에서는 원문 순서.
export function groupByAxis(changes: Change[]): Axis[] {
  const map = new Map<number, Change[]>();
  for (const c of changes) {
    for (const id of c.ruleIds) {
      const list = map.get(id);
      if (list) list.push(c);
      else map.set(id, [c]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => (a === UNCLASSIFIED ? 1 : b === UNCLASSIFIED ? -1 : a - b))
    .map(([id, list]) => ({
      id,
      name: ruleName(id),
      changes: list,
      revertedCount: list.filter((c) => !c.applied).length,
    }));
}