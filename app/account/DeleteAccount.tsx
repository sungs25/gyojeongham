'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { setDraft } from '@/lib/draft-store';
import { clearJob } from '@/lib/job-store';
import { saveDeleted } from '@/lib/deleted-store';
import { Hamster } from '@/app/components/Hamster';

// 회원 탈퇴 버튼을 누르면 확인 창을 띄우고, 창에서 한 번 더 누르면 서버에 탈퇴를 요청한다.
// 탈퇴가 끝나면 브라우저의 로그인도 지운 뒤 탈퇴를 마친 화면으로 간다
export function DeleteAccount() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function open() {
    setMessage(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

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
      // 환불받을 수 있는 주문을 탈퇴를 마친 화면에 넘긴다 (탈퇴 뒤에는 서버에서 다시 읽을 수 없다)
      saveDeleted(Array.isArray(json?.refundable) ? json.refundable : []);
      router.replace('/account/deleted');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button type="button" className="ghost account-delete" onClick={open}>
        회원 탈퇴
      </button>
      {/* 브라우저 기본 대화상자: 뒤가 어두워지고, Esc로 닫히고, 키보드가 창 안에서만 돈다.
          처음에는 "취소"에 초점이 간다(창 안 첫 버튼). 탈퇴 처리 중에는 Esc로 닫히지 않는다 */}
      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-labelledby="delete-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <Hamster scene="cry" scale={2} line="정말 가는 거야…?" />
        <h2 id="delete-title">정말 탈퇴하시겠습니까?</h2>
        <p>
          계정을 되돌릴 수 없고, 무료 씨앗은 사라집니다. 남은 유료 씨앗은 탈퇴한 뒤에도 환불을
          요청할 수 있습니다.
        </p>
        {message && <p className="credits-error">{message}</p>}
        <div className="confirm-actions">
          <button type="button" className="ghost" onClick={close} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="ghost account-delete"
            onClick={withdraw}
            disabled={busy}
          >
            {busy ? '처리 중입니다' : '탈퇴하기'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
