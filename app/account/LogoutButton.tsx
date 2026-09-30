'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setDraft } from '@/lib/draft-store';
import { clearJob } from '@/lib/job-store';

// 로그아웃: 브라우저의 로그인 정보를 지우고 첫 화면으로 간다
export function LogoutButton() {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    // 같은 탭을 다른 사람이 이어 쓸 수 있으니, 이 탭에 남은 입력 글과 교정 결과 열쇠도 지운다
    setDraft('');
    clearJob();
    router.replace('/');
  }

  return (
    <button type="button" className="ghost" onClick={signOut}>
      로그아웃
    </button>
  );
}