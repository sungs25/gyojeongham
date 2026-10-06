import { Payment } from '@portone/server-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPortOneClient } from '@/lib/portone';

export type SettleResult =
  | 'paid' // 씨앗을 줬다 (이번에 줬거나 이미 줬음)
  | 'not_paid' // 포트원에서 결제가 끝난 상태가 아니다 (결제창을 닫았거나 실패, 이 사이트의 채널이 아님)
  | 'mismatch' // 결제 금액이나 통화가 주문과 달라 결제를 취소했다
  | 'not_found'; // 그런 주문이 없다

// 결제 확인과 씨앗 지급. 결제창이 끝난 뒤의 이동(/credits/complete)과 웹훅이 같이 부른다.
// 브라우저가 보낸 값은 믿지 않는다: 주문(DB)과 포트원이 알려 준 실제 결제를 비교한다.
// 주문번호(orders.id)를 포트원 paymentId로 쓴다. 같은 주문으로 여러 번 불려도 grant_order가 씨앗을 한 번만 준다.
export async function settlePayment(orderId: string): Promise<SettleResult> {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from('orders')
    .select('id, user_id, amount, status')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`주문 읽기 실패: ${error.message}`);
  if (!order) return 'not_found';
  if (order.status === 'paid') return 'paid';

  const portone = createPortOneClient();
  let payment;
  try {
    payment = await portone.getPayment({ paymentId: orderId });
  } catch (e) {
    // 결제창을 열었다가 바로 닫으면 포트원에 결제 건이 없다
    if (e instanceof Payment.GetPaymentError && e.data.type === 'PAYMENT_NOT_FOUND') return 'not_paid';
    throw e;
  }
  if (payment.status !== 'PAID') return 'not_paid';

  // 이 사이트가 쓰는 채널의 결제만 인정한다. 상점 아이디와 채널 키는 브라우저에 공개되므로,
  // 운영 사이트에서 누군가 테스트 채널로 결제(실제 돈이 나가지 않음)해도 씨앗을 주지 않게 막는다
  if (payment.channel.key !== process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY) {
    console.error('다른 채널의 결제', { orderId, channel: payment.channel.key, type: payment.channel.type });
    return 'not_paid';
  }

  if (payment.currency !== 'KRW' || payment.amount.total !== order.amount) {
    await portone.cancelPayment({
      paymentId: orderId,
      reason: '주문 금액과 결제 금액이 달라 자동 취소',
    });
    console.error('결제 금액 불일치로 취소', {
      orderId,
      ordered: order.amount,
      paid: payment.amount.total,
      currency: payment.currency,
    });
    return 'mismatch';
  }

  const { error: grantError } = await admin.rpc('grant_order', {
    p_user: order.user_id,
    p_order: orderId,
    p_payment_key: payment.transactionId,
    p_amount: payment.amount.total,
  });
  if (grantError) throw new Error(`씨앗 지급 실패: ${grantError.message}`);
  return 'paid';
}