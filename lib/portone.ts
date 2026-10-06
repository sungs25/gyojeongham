import { PaymentClient } from '@portone/server-sdk';

// 서버 전용. API Secret으로 포트원에 결제를 조회하고 취소한다.
// supabase/admin.ts와 같이 브라우저 코드('use client' 파일)에서 절대 import하지 않는다.
export function createPortOneClient() {
  return PaymentClient({ secret: process.env.PORTONE_API_SECRET! });
}