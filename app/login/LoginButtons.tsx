'use client';

import { createClient } from '@/lib/supabase/client';

export function LoginButtons() {
  async function signIn(provider: 'google' | 'kakao') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // 로그인이 끝나면 교정 화면으로 돌아간다
        redirectTo: `${window.location.origin}/auth/callback?next=/write`,
      },
    });
  }

  return (
    <>
      <button type="button" className="ghost" onClick={() => signIn('google')}>
        구글로 로그인
      </button>
      <button type="button" className="ghost" onClick={() => signIn('kakao')}>
        카카오로 로그인
      </button>
    </>
  );
}