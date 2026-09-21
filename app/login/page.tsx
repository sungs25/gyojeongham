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

  // 로그인했으면 잔액을 읽는다. 권한 설정상 본인 줄만 돌아온다
  let balance: number | null = null;
  if (claims) {
    const { data: row } = await supabase
      .from('balances')
      .select('balance')
      .maybeSingle();
    balance = row?.balance ?? 0;
  }

  return (
    <main style={{ padding: 40 }}>
      {error && <p>로그인에 실패했습니다. 다시 시도해 주세요.</p>}
      {claims ? (
        <>
          <p>로그인됨: {claims.email || '(이메일 없음)'}</p>
          <p>사용자 ID: {claims.sub}</p>
          <p>씨앗: {balance}개</p>
          <LogoutButton />
        </>
      ) : (
        <LoginButtons />
      )}
    </main>
  );
}