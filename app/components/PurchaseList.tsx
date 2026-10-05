import { OrderNumber } from '@/app/components/OrderNumber';
import { formatDate, formatDateTime, formatWon, type Purchase } from '@/lib/purchases';

// 결제 한 건마다 카드 하나: 산 씨앗·금액, 결제 일시, 남은 씨앗과 이용 기한, 환불, 주문번호.
// 내 계정 화면과 탈퇴를 마친 화면이 같이 쓴다
export function PurchaseList({ purchases }: { purchases: Purchase[] }) {
  return (
    <ul className="purchases">
      {purchases.map((p) => (
        <li key={p.order_id} className="purchase">
          <p className="purchase-head">
            <strong>씨앗 {p.seeds}개</strong>
            <span>{formatWon(p.amount)}</span>
          </p>
          <dl className="purchase-facts">
            <dt>결제</dt>
            <dd>{formatDateTime(p.paid_at)}</dd>
            <dt>남은 씨앗</dt>
            <dd>
              {p.expired
                ? '이용 기간이 끝났습니다'
                : `${p.remaining}개 (${formatDate(p.expires_at)}까지)`}
            </dd>
            {p.refunded_seeds > 0 && (
              <>
                <dt>환불</dt>
                <dd>씨앗 {p.refunded_seeds}개 ({formatWon(p.refunded_amount)})</dd>
              </>
            )}
            {p.bonus && (
              <>
                <dt>보너스</dt>
                <dd>첫 결제 무료 씨앗 1개를 함께 받음</dd>
              </>
            )}
            <dt>주문번호</dt>
            <dd>
              <OrderNumber id={p.order_id} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
