import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  PURCHASE_COLUMNS,
  formatDate,
  formatDateTime,
  formatWon,
  type Purchase,
} from '@/lib/purchases';
import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';
import { OrderNumber } from '@/app/components/OrderNumber';

export const metadata: Metadata = { title: '결제 완료 — 교정햄' };

const CONTACT_EMAIL = 'gyojeongham2@gmail.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 결제 완료 화면 (6-4). 결제대행사 확인과 씨앗 지급(6-2에서 grant_order를 부르는 부분)이 끝나면 이 주소로 온다.
// 전자상거래법 13조②: 계약이 체결되면 계약 내용(상품·가격·이용 기간·청약철회)을 적어 소비자에게 준다.
// 같은 내용은 내 계정 화면의 구매 내역에서 언제든 다시 볼 수 있다
export default async function OrderDonePage(props: PageProps<'/credits/done/[id]'>) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect('/login');

  // 권한 설정상 본인 주문만 돌아온다. 남의 주문이나 없는 주문은 없는 주소로 본다
  // 읽기 오류(권한 등)는 없는 주소로 숨기지 않고 오류 화면으로 보낸다. 서버 로그에 원인이 남는다
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (orderError) throw new Error(`주문 읽기 실패: ${orderError.message}`);
  if (!order) notFound();

  let purchase: Purchase | null = null;
  if (order.status === 'paid') {
    const { data: row, error: purchaseError } = await supabase
      .from('purchases')
      .select(PURCHASE_COLUMNS)
      .eq('order_id', id)
      .maybeSingle();
    if (purchaseError) throw new Error(`구매 내역 읽기 실패: ${purchaseError.message}`);
    purchase = row as Purchase | null;
  }

  if (!purchase) {
    return (
      <div className="status-page">
        <SiteHeader />
        <main className="status-card order-card">
          <Hamster scene="ready" scale={2} line="잠깐만, 확인해 볼게!" />
          <h1>결제를 확인하지 못했습니다</h1>
          <p>
            이 주문은 아직 결제가 끝난 것으로 확인되지 않았습니다. 결제를 마쳤다면 잠시 뒤 새로
            고쳐 주세요. 그래도 그대로면 아래 주문번호와 함께{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>으로 알려 주세요.
          </p>
          <dl className="purchase-facts">
            <dt>주문번호</dt>
            <dd>
              <OrderNumber id={id} />
            </dd>
          </dl>
          <div className="status-actions">
            <Link className="ghost" href="/credits">
              씨앗 사기 화면으로
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="status-page">
      <SiteHeader />
      <main className="status-card order-card">
        <Hamster scene="done" scale={2} line="씨앗 잘 받았어! 열심히 고칠게!" />
        <h1>결제가 끝났습니다</h1>
        <dl className="purchase-facts">
          <dt>상품</dt>
          <dd>교정햄 씨앗 {purchase.seeds}개 (씨앗 1개로 3,000자까지 교정)</dd>
          {purchase.bonus && (
            <>
              <dt>보너스</dt>
              <dd>첫 결제 무료 씨앗 1개</dd>
            </>
          )}
          <dt>결제 금액</dt>
          <dd>{formatWon(purchase.amount)}</dd>
          <dt>결제 일시</dt>
          <dd>{formatDateTime(purchase.paid_at)}</dd>
          <dt>이용 기간</dt>
          <dd>{formatDate(purchase.expires_at)}까지 (산 날부터 5년)</dd>
          <dt>주문번호</dt>
          <dd>
            <OrderNumber id={purchase.order_id} />
          </dd>
        </dl>
        <ul className="credits-refund">
          <li>
            <strong>쓴 씨앗은 환불되지 않습니다.</strong> 쓰지 않은 씨앗은 산 지 7일 안이면 전액,
            그 뒤에는 10%를 빼고 환불합니다.
          </li>
          <li>
            환불은 주문번호와 함께 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>으로
            요청해 주세요.
          </li>
          <li>
            이 내용은 내 계정 화면의 구매 내역에서 다시 볼 수 있습니다.{' '}
            <Link href="/refund">환불 정책</Link> · <Link href="/terms">이용약관</Link>
          </li>
        </ul>
        <div className="status-actions">
          <Link className="primary" href="/write">
            글 맡기기
          </Link>
          <Link className="ghost" href="/account">
            내 계정
          </Link>
        </div>
      </main>
    </div>
  );
}
