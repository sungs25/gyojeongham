'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Account =
  | { kind: 'loading' }
  | { kind: 'anon' }
  | { kind: 'user'; balance: number };

// 모든 화면 맨 위 머리글. 왼쪽은 교정햄 이름(누르면 첫 화면), 오른쪽은 계정 표시.
// refreshKey가 바뀔 때마다 로그인 상태와 잔액을 다시 읽는다.
// 화면 표시용일 뿐이고, 실제 차감 여부는 서버가 판단한다.
export function SiteHeader({ refreshKey = 0 }: { refreshKey?: number }) {
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

  return (
    // 로그인하면 오른쪽이 길어지므로, 아주 좁은 화면에서는 이름을 숨기고 아이콘만 남긴다
    <header className={`site-header ${account.kind === 'user' ? 'signed-in' : ''}`}>
      <Link className="brand" href="/" aria-label="교정햄 첫 화면">
        {/* 아이콘(32칸 도트)을 1:1 크기로 쓴다 */}
        <Image src="/icon.png" alt="" width={32} height={32} unoptimized />
        <span className="brand-name">교정햄</span>
      </Link>
      <nav className="account">
        {account.kind === 'anon' && (
          <>
            {/* 넓은 화면에서만 보인다 (좁은 화면은 첫 화면을 내리면 바로 요금이 나온다) */}
            <Link className="account-price" href="/#price">
              요금
            </Link>
            <a className="ghost small" href="/login">
              로그인
            </a>
          </>
        )}
        {account.kind === 'user' && (
          <>
            <span>
              씨앗 <span className="account-seed">{account.balance}</span>개
            </span>
            <a className="ghost small" href="/credits">
              씨앗 사기
            </a>
            <a className="ghost small" href="/account">
              내 계정
            </a>
          </>
        )}
      </nav>
    </header>
  );
}