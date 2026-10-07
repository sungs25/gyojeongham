import { Webhook } from '@portone/server-sdk';
import { settlePayment } from '@/lib/settle-payment';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 포트원 웹훅. 결제가 끝난 뒤 브라우저를 닫거나 인터넷이 끊겨 /credits/complete에 오지 못해도
// 포트원이 이 주소로 결제 완료를 알려 주면 씨앗을 준다. 확인 방법은 /credits/complete와 같다(settlePayment).
// 웹훅 내용은 믿지 않고 서명만 확인한 뒤, 결제 상태와 금액은 포트원 API로 다시 조회한다.
// 200이 아닌 응답을 받으면 포트원이 다시 보내므로, 우리 쪽 오류일 때만 500을 돌려준다.
export async function POST(request: Request) {
  const body = await request.text();

  let webhook;
  try {
    webhook = await Webhook.verify(
      process.env.PORTONE_WEBHOOK_SECRET!,
      body,
      Object.fromEntries(request.headers.entries()),
    );
  } catch (e) {
    if (e instanceof Webhook.WebhookVerificationError) {
      console.error('웹훅 서명 확인 실패', e.reason);
      return new Response('invalid signature', { status: 400 });
    }
    throw e;
  }

  // 결제 완료만 처리한다. 취소·실패 등은 환불을 사람이 처리하므로 여기서 할 일이 없다
  if (webhook.type !== 'Transaction.Paid' || !('data' in webhook)) {
    return new Response('ignored');
  }

  const paymentId = webhook.data.paymentId;
  // 교정햄 주문번호(uuid)가 아니면 이 사이트의 결제가 아니다
  if (!UUID.test(paymentId)) return new Response('ignored');

  try {
    const result = await settlePayment(paymentId);
    return new Response(result);
  } catch (e) {
    console.error('웹훅 결제 확인 실패', paymentId, e);
    return new Response('error', { status: 500 });
  }
}