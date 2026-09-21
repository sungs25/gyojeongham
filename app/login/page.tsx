import { createClient } from '@/lib/supabase/server';
import { LoginButtons } from './LoginButtons';
import { LogoutButton } from './LogoutButton';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  return (
    <main style={{ padding: 40 }}>
      {error && <p>로그인에 실패했습니다. 다시 시도해 주세요.</p>}
      {claims ? (
        <>
          <p>로그인됨: {claims.email || '(이메일 없음)'}</p>
          <p>사용자 ID: {claims.sub}</p>
          <LogoutButton />
        </>
      ) : (
        <LoginButtons />
      )}
    </main>
  );
}