import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';
import { DeletedOrders } from './DeletedOrders';

export const metadata: Metadata = { title: '탈퇴 완료 — 교정햄' };

// 탈퇴를 마친 화면. 환불 정책의 "주문번호는 탈퇴 화면에 있음"이 이 화면이다
export default function DeletedPage() {
  return (
    <div className="status-page">
      <SiteHeader />
      <main className="status-card order-card">
        <Hamster scene="ready" scale={2} line="그동안 고마웠어!" />
        <h1>탈퇴했습니다</h1>
        <DeletedOrders />
        <div className="status-actions">
          <Link className="primary" href="/">
            첫 화면으로
          </Link>
        </div>
      </main>
    </div>
  );
}
