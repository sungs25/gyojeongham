'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setDraft } from '@/lib/draft-store';
import { clearJob } from '@/lib/job-store';

// 탈퇴 확인 체크 후 버튼을 누르면 서버에 탈퇴를 요청하고, 브라우저의 로그인도 지운다
export function DeleteAccount() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(json?.error ?? '탈퇴를 처리하지 못했습니다.');
        return;
      }
      // 서버에서 세션은 이미 끊겼다. 브라우저에 남은 로그인 정보만 지운다
      await createClient()
        .auth.signOut()
        .catch(() => {});
      // 이 탭에 남은 입력 글과 교정 결과 열쇠도 지운다
      setDraft('');
      clearJob();
      router.replace('/write');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <label className="account-confirm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        위 내용을 확인했고 탈퇴합니다.
      </label>
      {message && <p className="credits-error">{message}</p>}
      <button
        type="button"
        className="ghost account-delete"
        disabled={!agreed || busy}
        onClick={withdraw}
      >
        {busy ? '처리 중입니다' : '회원 탈퇴'}
      </button>
    </section>
  );
}