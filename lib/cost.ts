import type { Usage } from '@/app/write/reducer';

// Opus 5: 입력 $5 / 출력 $25 per MTok
// 캐시 쓰기는 입력의 1.25배, 캐시 읽기는 0.1배
const INPUT = 5;
const OUTPUT = 25;
const USD_TO_KRW = 1400;

export function costKrw(usages: Usage[]): number {
  const dollars = usages.reduce(
    (sum, u) =>
      sum +
      (u.inputTokens * INPUT +
        u.cacheCreationTokens * INPUT * 1.25 +
        u.cacheReadTokens * INPUT * 0.1 +
        u.outputTokens * OUTPUT) /
        1_000_000,
    0,
  );

  return dollars * USD_TO_KRW;
}

export function summarize(usages: Usage[]) {
  return {
    output: usages.reduce((s, u) => s + u.outputTokens, 0),
    thinking: usages.reduce((s, u) => s + u.thinkingTokens, 0),
    cacheWrites: usages.filter((u) => u.cacheCreationTokens > 0).length,
    cacheReads: usages.filter((u) => u.cacheReadTokens > 0).length,
  };
}