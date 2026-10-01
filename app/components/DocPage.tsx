import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';

// 약관·환불 정책·개인정보 처리방침 화면: 모눈 바탕 위에 카드 한 장
export function DocPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="doc-page">
      <SiteHeader />
      <main className="doc">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}