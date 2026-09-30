'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// 로그아웃: 브라우저의 로그인 정보를 지우고 첫 화면으로 간다
export function LogoutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/');
  }

  return (
    <button type="button" className="ghost" onClick={signOut}>
      로그아웃
    </button>
  );
}