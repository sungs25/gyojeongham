import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginButtons } from './LoginButtons';

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
    <main className="login">
      <h1>교정햄 로그인</h1>
      {error && <p className="login-error">로그인에 실패했습니다. 다시 시도해 주세요.</p>}
      <LoginButtons />
    </main>
  );
}