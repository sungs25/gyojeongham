import { formatWon } from '@/lib/purchases';

// 씨앗 내역 한 줄 (seed_history 뷰, 021). 내 계정 > 씨앗 내역 화면이 쓴다
export type SeedHistoryKind =
  | 'purchase'
  | 'bonus'
  | 'opening'
  | 'adjust'
  | 'use'
  | 'use_failed'
  | 'use_stopped'
  | 'use_running'
  | 'refund'
  | 'refund_bonus'
  | 'expire';

export type SeedHistoryLine = {
  seq: number;
  at: string;
  kind: SeedHistoryKind;
  delta: number;
  lot_seeds: number | null;
  lot_amount: number | null;
  chars: number | null;
  chars_done: number | null;
  balance: number;
};

export const SEED_HISTORY_COLUMNS =
  'seq, at, kind, delta, lot_seeds, lot_amount, chars, chars_done, balance';

function chars(n: number | null): string {
  return `${(n ?? 0).toLocaleString('ko-KR')}자`;
}

// 줄마다 무엇이 있었는지 (이니시스가 말한 "상품명": 교정은 글자 수까지 적는다)
export function describeLine(line: SeedHistoryLine): string {
  switch (line.kind) {
    case 'purchase':
      return `씨앗 ${line.lot_seeds}개 구매 (${formatWon(line.lot_amount ?? 0)})`;
    case 'bonus':
      return '첫 결제 무료 씨앗';
    case 'opening':
      return '기존 씨앗';
    case 'adjust':
      return '씨앗 조정';
    case 'use':
      return `교정 ${chars(line.chars)}`;
    case 'use_failed':
      return `교정 ${chars(line.chars)} · 실패해 씨앗을 모두 돌려드림`;
    case 'use_stopped':
      return `교정 ${chars(line.chars)} 중 ${chars(line.chars_done)} · 멈춰서 끝난 분량만 사용`;
    case 'use_running':
      return `교정 ${chars(line.chars)} · 진행 중`;
    case 'refund':
      return '환불';
    case 'refund_bonus':
      return '첫 결제 무료 씨앗 회수 (첫 결제 전액 환불)';
    case 'expire':
      return '이용 기간(1년)이 끝나 소멸';
  }
}

// +5 / −1 / 0
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${-delta}`;
  return '0';
}