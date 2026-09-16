// 프롬프트의 15개 규칙 번호 → 화면에 보일 축 이름
export const RULE_NAMES: Record<number, string> = {
  1: '군더더기',
  2: '어순',
  3: '주술 호응',
  4: '꾸밈말 위치',
  5: '피동·사동',
  6: '조사',
  7: '적·들·의·것',
  8: '지시대명사',
  9: '시제',
  10: '명사형',
  11: '흐린 종결',
  12: '대비 문장',
  13: '주절 위치',
  14: '중복',
  15: '긴 문장',
};

// 번호를 하나도 못 뽑았을 때 넣는 축
export const UNCLASSIFIED = 0;

export function ruleName(id: number): string {
  return RULE_NAMES[id] ?? '분류 없음';
}

// "1, 11" / "7번" / "" 등 형식에 기대지 않고 1~15 숫자만 뽑는다.
export function parseRuleIds(raw: string): number[] {
  const ids = (raw.match(/\d+/g) ?? [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 15);
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [UNCLASSIFIED];
}