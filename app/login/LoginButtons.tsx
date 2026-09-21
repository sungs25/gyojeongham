'use client';

import { createClient } from '@/lib/supabase/client';

export function LoginButtons() {
  async function signIn(provider: 'google') {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/login`,
      },
    });
  }

  return (
    <button type="button" onClick={() => signIn('google')}>
      구글로 로그인
    </button>
  );
}