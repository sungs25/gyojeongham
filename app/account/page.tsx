import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PURCHASE_COLUMNS, type Purchase } from '@/lib/purchases';
import { SiteHeader } from '@/app/components/SiteHeader';
import { PurchaseList } from '@/app/components/PurchaseList';
import { DeleteAccount } from './DeleteAccount';
import { LogoutButton } from './LogoutButton';

const PROVIDER_NAMES: Record<string, string> = { kakao: '카카오', google: '구글' };

// 내 계정: 로그인한 계정 종류, 씨앗 잔액, 구매 내역, 회원 탈퇴
export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect('/login');
  }

  // 권한 설정상 본인 줄만 돌아온다
  const { data: row } = await supabase.from('balances').select('balance').maybeSingle();
  const balance = row?.balance ?? 0;

  // 결제가 끝난 주문만, 최근 것부터
  const { data: purchaseRows, error: purchaseError } = await supabase
    .from('purchases')
    .select(PURCHASE_COLUMNS)
    .order('paid_at', { ascending: false });
  if (purchaseError) console.error('구매 내역 읽기 실패', purchaseError);
  const purchases = purchaseError ? null : ((purchaseRows ?? []) as Purchase[]);

  // 쓰거나 환불받을 수 있는 씨앗이 남은 결제는 펼쳐 두고, 나머지(다 썼거나 환불 기한이 끝난 결제)는 접어 둔다
  const active = purchases?.filter((p) => p.remaining > 0 && p.refundable) ?? [];
  const past = purchases?.filter((p) => !(p.remaining > 0 && p.refundable)) ?? [];

  const provider = PROVIDER_NAMES[claims.app_metadata?.provider ?? ''] ?? '소셜';

  return (
      <>
      <SiteHeader />
      <main className="credits">
      <a className="credits-back" href="/write">
        ← 교정 화면으로
      </a>
      <h1>내 계정</h1>
      <p className="credits-note">
        <strong>{provider} 계정</strong>으로 로그인되어 있습니다. 남은 씨앗은{' '}
        <strong>{balance}개</strong>입니다.
      </p>
      <LogoutButton />
      <h2 className="account-title">구매 내역</h2>
      {purchases === null ? (
        <p className="credits-note">구매 내역을 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>
      ) : purchases.length === 0 ? (
        <p className="credits-note">아직 산 씨앗이 없습니다.</p>
      ) : (
        <>
          {active.length > 0 ? (
            <PurchaseList purchases={active} />
          ) : (
            <p className="credits-note">쓰거나 환불받을 수 있는 씨앗이 남은 결제가 없습니다.</p>
          )}
          {past.length > 0 && (
            <details className="past-purchases">
              <summary>지난 결제 {past.length}건 보기</summary>
              <PurchaseList purchases={past} />
            </details>
          )}
          <p className="credits-note">
            환불을 요청할 때는 주문번호를 알려 주세요. <Link href="/refund">환불 정책</Link>
          </p>
        </>
      )}
      <h2 className="account-danger-title">회원 탈퇴</h2>
      <ul className="credits-note account-danger-list">
        <li>탈퇴하면 계정을 되돌릴 수 없고, 무료 씨앗은 사라집니다.</li>
        <li>
          남은 유료 씨앗은 탈퇴한 뒤에도 <Link href="/refund">환불 정책</Link>에 따라 환불을 요청할 수 있습니다.
        </li>
        <li>남은 유료 씨앗이 있으면 탈퇴를 마친 화면에서 주문번호를 한 번 더 보여 드립니다.</li>
        <li>결제 기록은 전자상거래법에 따라 5년간 보관한 뒤 파기합니다.</li>
        <li>같은 소셜 계정으로 다시 로그인하면 새 계정으로 가입됩니다.</li>
      </ul>
      <DeleteAccount />
    </main>
    </>
  );
}