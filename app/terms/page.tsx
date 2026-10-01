import type { Metadata } from 'next';
import { DocPage } from '@/app/components/DocPage';

export const metadata: Metadata = { title: '이용약관 — 교정햄' };

export default function TermsPage() {
  return (
    <DocPage title="이용약관">
      <p>본문은 다음 단계에서 채웁니다.</p>
    </DocPage>
  );
}