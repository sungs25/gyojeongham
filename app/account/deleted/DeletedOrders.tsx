'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { PurchaseList } from '@/app/components/PurchaseList';
import {
  getDeletedRaw,
  getServerDeletedRaw,
  parseDeleted,
  subscribeDeleted,
} from '@/lib/deleted-store';

const CONTACT_EMAIL = 'gyojeongham2@gmail.com';

// 탈퇴 직전에 읽어 둔 "환불받을 수 있는 주문"을 보여 준다.
// 없거나(남은 유료 씨앗 없음) 이 탭에 저장된 것이 없으면 인사만 한다
export function DeletedOrders() {
  const raw = useSyncExternalStore(subscribeDeleted, getDeletedRaw, getServerDeletedRaw);
  const orders = parseDeleted(raw);

  if (!orders || orders.length === 0) {
    return <p>그동안 교정햄을 이용해 주셔서 감사합니다.</p>;
  }

  return (
    <>
      <p>
        환불받으실 수 있는 유료 씨앗이 남아 있습니다. 이 탭을 닫으면 주문번호를 다시 볼 수 없으니
        적어 두세요.
      </p>
      <PurchaseList purchases={orders} />
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>으로 주문번호를 보내 주시면{' '}
        <Link href="/refund">환불 정책</Link>에 따라 돌려드립니다.
      </p>
    </>
  );
}
