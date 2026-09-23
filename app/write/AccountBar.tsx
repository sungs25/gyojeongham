'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Account =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'user'; balance: number };

// 오른쪽 위 계정 표시. refreshKey가 바뀔 때마다 로그인 상태와 잔액을 다시 읽는다.
// 화면 표시용일 뿐이고, 실제 차감 여부는 서버가 판단한다.
export function AccountBar({ refreshKey }: { refreshKey: number }) {
  const [account, setAccount] = useState<Account>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data } = await supabase.auth.getClaims();
      if (!data?.claims) {
        if (!cancelled) setAccount({ kind: 'anon' });
        return;
      }
      // 권한 설정상 본인 줄만 돌아온다
      const { data: row } = await supabase.from('balances').select('balance').maybeSingle();
      if (!cancelled) setAccount({ kind: 'user', balance: row?.balance ?? 0 });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function signOut() {
    await createClient().auth.signOut();
    setAccount({ kind: 'anon' });
  }

  return (
    <header className="account">
      {account.kind === 'anon' && (
        <a className="ghost small" href="/login">
          로그인
        </a>
      )}
      {account.kind === 'user' && (
        <>
          <span>
            씨앗 <span className="account-seed">{account.balance}</span>개
          </span>
          <button type="button" className="ghost small" onClick={signOut}>
            로그아웃
          </button>
        </>
      )}
    </header>
  );
}