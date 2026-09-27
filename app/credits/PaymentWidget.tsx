'use client';

import { useEffect, useState } from 'react';
import { ANONYMOUS, loadTossPayments } from '@tosspayments/tosspayments-sdk';

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

// 토스 결제위젯(결제수단 목록 + 약관)을 그린다.
// 6-1에서는 비회원(ANONYMOUS)으로 띄우기만 하고, 결제 버튼은 6-3에서 붙인다.
export function PaymentWidget({ amount }: { amount: number }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const destroyers: Array<() => Promise<void>> = [];

    async function render() {
      try {
        const tossPayments = await loadTossPayments(CLIENT_KEY);
        // 개발 모드는 effect를 두 번 실행한다. 첫 번째 실행은 여기서 멈춘다
        if (cancelled) return;

        const widgets = tossPayments.widgets({ customerKey: ANONYMOUS });
        // 금액 설정이 그리기보다 먼저여야 한다
        await widgets.setAmount({ currency: 'KRW', value: amount });
        const [methods, agreement] = await Promise.all([
          widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
        ]);
        destroyers.push(methods.destroy, agreement.destroy);

        if (cancelled) {
          await Promise.all(destroyers.map((d) => d()));
          return;
        }
        setStatus('ready');
      } catch (error) {
        console.error('결제위젯 오류', error);
        if (!cancelled) setStatus('error');
      }
    }

    render();
    return () => {
      cancelled = true;
      destroyers.forEach((d) => d());
    };
  }, [amount]);

  return (
    <section>
      {status === 'loading' && <p>결제 수단을 불러오는 중입니다.</p>}
      {status === 'error' && <p>결제 수단을 불러오지 못했습니다.</p>}
      <div id="payment-method" />
      <div id="agreement" />
    </section>
  );
}