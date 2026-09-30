import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginButtons } from './LoginButtons';
import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
        <Hamster scene="ready" scale={2} line="로그인하고 글 맡겨줘!" />
        <h1>교정햄 로그인</h1>
        {error && <p className="login-error">로그인에 실패했습니다. 다시 시도해 주세요.</p>}
        <LoginButtons />
      </main>
    </div>
  );
}