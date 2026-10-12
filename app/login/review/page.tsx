import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SiteHeader } from '@/app/components/SiteHeader';
import { ReviewLoginForm } from './ReviewLoginForm';

// 결제대행사·카드사 심사원용 로그인. 교정햄은 카카오·구글 로그인만 있어 심사원이 쓸 계정이 없다.
// Supabase에서 직접 만든 이메일·비밀번호 계정으로만 들어온다.
// 화면 어디에도 링크하지 않고(주소는 심사 신청서에만 적는다) 검색에도 올리지 않는다.
export const metadata: Metadata = {
  title: '심사용 로그인',
  robots: { index: false, follow: false },
};

export default async function ReviewLoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  // 이미 로그인했으면 교정 화면으로
  if (data?.claims) {
    redirect('/write');
  }

  return (
    <div className="login-page">
      <SiteHeader />
      <main className="login">
        <h1>심사용 로그인</h1>
        <ReviewLoginForm />
      </main>
    </div>
  );
}