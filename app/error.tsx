'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';

// 화면을 그리다 예상하지 못한 오류가 났을 때 보이는 화면 (Next가 이 파일을 오류 경계로 쓴다)
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // 배포 환경에서는 원래 메시지 대신 digest(서버 기록과 맞춰 볼 번호)만 온다
    console.error(error);
  }, [error]);

  return (
    <div className="status-page">
      <SiteHeader />
      <main className="status-card">
        <Hamster scene="ready" scale={2} line="앗, 뭔가 꼬였어!" />
        <h1>화면을 불러오지 못했습니다</h1>
        <p>잠시 뒤 다시 시도해 주세요. 계속 이러면 새로 고쳐 주세요.</p>
        <div className="status-actions">
          <button type="button" className="primary" onClick={() => retry()}>
            다시 시도
          </button>
          <Link className="ghost" href="/">
            첫 화면으로
          </Link>
        </div>
      </main>
    </div>
  );
}