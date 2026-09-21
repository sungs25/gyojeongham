'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // 서버 컴포넌트(page.tsx)를 다시 그려 로그인 버튼으로 바꾼다
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut}>
      로그아웃
    </button>
  );
}