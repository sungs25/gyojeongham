import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { settlePayment, type SettleResult } from '@/lib/settle-payment';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 결제창이 끝나면 오는 주소. PC는 결제창이 닫힌 뒤 씨앗 사기 화면의 코드가, 모바일은 포트원이 이 주소로 보낸다.
// paymentId(= 주문번호)가 붙어 오고, 결제창을 닫았거나 실패했으면 code와 message가 함께 붙는다.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const paymentId = url.searchParams.get('paymentId') ?? '';
  const code = url.searchParams.get('code');

  // 씨앗 사기 화면으로 돌려보내며 이유를 보여 준다
  const backToCredits = (message: string) => {
    const to = new URL('/credits', url);
    to.searchParams.set('failed', message);
    return NextResponse.redirect(to, 303);
  };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return NextResponse.redirect(new URL('/login', url), 303);

  // 결제창을 닫았거나 결제가 실패했다. 포트원이 준 사유(카드사 한도 초과 등)를 그대로 보여 준다
  if (code) return backToCredits(url.searchParams.get('message') || '결제가 끝나지 않았습니다.');
  if (!UUID.test(paymentId)) return backToCredits('주문번호가 올바르지 않습니다.');

  let result: SettleResult | 'error';
  try {
    result = await settlePayment(paymentId);
  } catch (e) {
    console.error('결제 확인 실패', paymentId, e);
    result = 'error';
  }

  if (result === 'mismatch') return backToCredits('결제 금액이 주문 금액과 달라 결제를 취소했습니다.');
  if (result === 'not_found') return backToCredits('주문을 찾지 못했습니다.');
  // 씨앗을 줬거나 아직 확인되지 않았으면 결제 완료 화면이 상태를 보여 준다
  // (확인되지 않은 주문은 "결제를 확인하지 못했습니다"와 문의 안내가 나온다)
  return NextResponse.redirect(new URL(`/credits/done/${paymentId}`, url), 303);
}