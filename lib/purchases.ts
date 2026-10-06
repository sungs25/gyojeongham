// 구매 내역 한 줄 (purchases 뷰, 016·017·019). 결제 완료·내 계정·탈퇴 화면이 같이 쓴다
export type Purchase = {
  order_id: string;
  seeds: number;
  amount: number;
  paid_at: string;
  expires_at: string;
  expired: boolean;
  remaining: number;
  bonus: boolean;
  refunded_seeds: number;
  refunded_amount: number;
  refund_until: string;
  refundable: boolean;
};

export const PURCHASE_COLUMNS =
  'order_id, seeds, amount, paid_at, expires_at, expired, remaining, bonus, refunded_seeds, refunded_amount, refund_until, refundable';
// 날짜는 한국 시간으로 적는다 (서버의 시간대는 UTC다)
const DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// 2026년 10월 5일
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

// 2026년 10월 5일 18:45
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

// 4,900원
export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
