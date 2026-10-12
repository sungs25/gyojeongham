'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// 심사용 계정(이메일·비밀번호) 로그인 칸. 계정은 Supabase 대시보드에서만 만든다(이 화면에는 가입이 없다)
export function ReviewLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setMessage('아이디나 비밀번호가 맞지 않습니다.');
      setBusy(false);
      return;
    }
    // 로그인 쿠키가 생겼으니 교정 화면으로 간다
    router.replace('/write');
  }

  return (
    <form onSubmit={signIn}>
      <fieldset className="buyer" disabled={busy}>
        <label>
          아이디(이메일)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
      </fieldset>
      {message && (
        <p className="login-error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" className="primary" disabled={busy}>
        로그인
      </button>
    </form>
  );
}