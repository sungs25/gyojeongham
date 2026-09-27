'use client';

import { useEffect, useState } from 'react';
import { loadTossPayments, type TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { PRODUCTS, type Product } from '@/lib/products';

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

// 상품 고르기 + 토스 결제위젯(결제수단 목록, 약관).
// 결제 버튼은 주문 테이블(6-2)이 생긴 뒤 6-4에서 연결한다.
export function PaymentWidget({ customerKey }: { customerKey: string }) {
  const [product, setProduct] = useState<Product>(PRODUCTS[0]);
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // 위젯은 처음 한 번만 그린다. 첫 금액은 처음 선택된 상품 가격
  useEffect(() => {
    let cancelled = false;
    const destroyers: Array<() => Promise<void>> = [];

    async function render() {
      try {
        const tossPayments = await loadTossPayments(CLIENT_KEY);
        // 개발 모드는 effect를 두 번 실행한다. 첫 번째 실행은 여기서 멈춘다
        if (cancelled) return;

        // customerKey는 로그인한 사용자 ID. 토스는 추측하기 어려운 값을 요구한다
        const w = tossPayments.widgets({ customerKey });
        // 금액 설정이 그리기보다 먼저여야 한다
        await w.setAmount({ currency: 'KRW', value: PRODUCTS[0].price });
        const [methods, agreement] = await Promise.all([
          w.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
          w.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
        ]);
        destroyers.push(methods.destroy, agreement.destroy);

        if (cancelled) {
          await Promise.all(destroyers.map((d) => d()));
          return;
        }
        setWidgets(w);
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
  }, [customerKey]);

  // 상품을 바꾸면 위젯 금액도 바꾼다. 위젯이 준비되기 전에는 버튼이 꺼져 있다
  function choose(next: Product) {
    setProduct(next);
    widgets?.setAmount({ currency: 'KRW', value: next.price }).catch((error) => {
      console.error('금액 변경 오류', error);
      setStatus('error');
    });
  }

  const ready = status === 'ready';

  return (
    <section>
      <ul className="products">
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={p.id === product.id ? 'product on' : 'product'}
              aria-pressed={p.id === product.id}
              disabled={!ready}
              onClick={() => choose(p)}
            >
              <span className="product-name">{p.name}</span>
              <span className="product-sub">
                씨앗 {p.seeds}개 · 개당 {Math.round(p.price / p.seeds).toLocaleString('ko-KR')}원
              </span>
              <span className="product-price">{p.price.toLocaleString('ko-KR')}원</span>
            </button>
          </li>
        ))}
      </ul>

      {status === 'loading' && <p className="credits-note">결제 수단을 불러오는 중입니다.</p>}
      {status === 'error' && <p className="credits-note">결제 수단을 불러오지 못했습니다.</p>}
      <div id="payment-method" />
      <div id="agreement" />

      {/* 6-4에서 주문 생성·결제 요청을 연결한다 */}
      <button type="button" className="primary credits-pay" disabled>
        {product.price.toLocaleString('ko-KR')}원 결제하기
      </button>
    </section>
  );
}