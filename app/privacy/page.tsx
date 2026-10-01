import type { Metadata } from 'next';
import { DocPage } from '@/app/components/DocPage';

export const metadata: Metadata = { title: '개인정보 처리방침 — 교정햄' };

export default function PrivacyPage() {
  return (
    <DocPage title="개인정보 처리방침">
      <p>본문은 다음 단계에서 채웁니다.</p>
    </DocPage>
  );
}