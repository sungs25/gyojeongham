import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/app/components/SiteHeader';
import { DeleteAccount } from './DeleteAccount';
import { LogoutButton } from './LogoutButton';

const PROVIDER_NAMES: Record<string, string> = { kakao: '카카오', google: '구글' };

// 내 계정: 로그인한 계정 종류, 씨앗 잔액, 회원 탈퇴
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
      <h2 className="account-danger-title">회원 탈퇴</h2>
      <ul className="credits-note account-danger-list">
        <li>탈퇴하면 남은 씨앗은 모두 사라지고 되돌릴 수 없습니다.</li>
        <li>구매한 씨앗의 환불을 원하시면 탈퇴 전에 먼저 요청해 주세요.</li>
        <li>결제 기록은 전자상거래법에 따라 5년간 보관한 뒤 파기합니다.</li>
        <li>같은 소셜 계정으로 다시 로그인하면 새 계정으로 가입됩니다.</li>
      </ul>
      <DeleteAccount />
    </main>
    </>
  );
}