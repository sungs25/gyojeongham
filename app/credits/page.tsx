import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PaymentWidget } from './PaymentWidget';
import { Hamster } from '@/app/components/Hamster';
import { SiteHeader } from '@/app/components/SiteHeader';

const PROVIDER_NAMES: Record<string, string> = { kakao: '카카오', google: '구글' };

// 씨앗 구매 화면. 로그인한 사람만 들어온다.
// failed: 결제창을 닫았거나 결제가 실패해 /credits/complete가 돌려보낼 때 붙이는 사유
export default async function CreditsPage(props: PageProps<'/credits'>) {
  const { failed } = await props.searchParams;
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
      <PaymentWidget
        defaultEmail={typeof claims.email === 'string' ? claims.email : ''}
        failed={typeof failed === 'string' ? failed : null}
      />
      {/* 전자상거래법 17조⑥: 청약철회가 안 되는 부분(쓴 씨앗)을 결제 화면에서 명확히 알리고,
          어떤 결과가 나오는지 첫 화면 예시로 안내한다(시행령 21조의2 정보 제공).
          13조③: 미성년자에게 법정대리인 동의 없는 결제는 취소할 수 있다고 알린다 */}
      <ul className="credits-refund">
        <li>
          <strong>쓴 씨앗은 교정을 받은 것이라 환불되지 않습니다.</strong> 교정 결과가 어떻게
          나오는지는 <Link href="/#sample">실제 교정 결과 예시</Link>에서 볼 수 있습니다.
        </li>
        <li>
          쓰지 않은 씨앗은 산 지 7일 안이면 전액, 그 뒤에는 10%를 빼고 환불합니다.{' '}
          <Link href="/refund">환불 정책</Link>
        </li>
        <li>
          씨앗은 산 날부터 1년 동안 쓸 수 있습니다. 쓰지 않은 씨앗은 산 날부터 5년 안에 환불받을 수
          있습니다.
        </li>
        <li>씨앗은 교정에만 쓰는 이용권이라 현금으로 바꾸거나 다른 계정에 넘길 수 없습니다.</li>
        <li>미성년자가 법정대리인의 동의 없이 결제한 경우, 본인 또는 법정대리인이 취소할 수 있습니다.</li>
      </ul>
    </main>
    </>
  );
}