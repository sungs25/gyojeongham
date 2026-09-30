import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PaymentWidget } from './PaymentWidget';
import { Hamster } from '@/app/components/Hamster';
import { SiteHeader } from '@/app/components/SiteHeader';

const PROVIDER_NAMES: Record<string, string> = { kakao: '카카오', google: '구글' };

// 씨앗 구매 화면. 로그인한 사람만 들어온다.
export default async function CreditsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect('/login');
  }

  const provider = PROVIDER_NAMES[claims.app_metadata?.provider ?? ''] ?? '지금';

  return (
      <>
      <SiteHeader />
      <main className="credits">
      <a className="credits-back" href="/write">
        ← 교정 화면으로
      </a>
      <h1>씨앗 사기</h1>
      <Hamster scene="seed" line="교정햄이 씨앗 먹고 힘낼 수 있게 도와주세요!" />
      <p className="credits-note">
        씨앗 1개로 3,000자까지 교정합니다. 씨앗은 로그인한 계정마다 따로 쌓이며, 지금은{' '}
        <strong>{provider} 계정</strong>으로 로그인되어 있습니다.
      </p>
      <PaymentWidget customerKey={claims.sub} />
    </main>
    </>
  );
}