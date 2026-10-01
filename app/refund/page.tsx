import type { Metadata } from 'next';
import { DocPage } from '@/app/components/DocPage';

export const metadata: Metadata = { title: '환불 정책 — 교정햄' };

export default function RefundPage() {
  return (
    <DocPage title="환불 정책">
      <p>본문은 다음 단계에서 채웁니다.</p>
    </DocPage>
  );
}