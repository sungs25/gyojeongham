'use client';

import { useState } from 'react';
import PortOne from '@portone/browser-sdk/v2';
import { CHARS_PER_SEED, PRODUCTS, type Product } from '@/lib/products';

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID!;
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY!;

type OrderResponse = { orderId: string; amount: number; orderName: string };

// 휴대폰 번호는 숫자만 남겨 보낸다 (010-1234-5678 → 01012345678). 010은 11자리, 011·016~019는 10~11자리
const PHONE = /^(010\d{8}|01[16789]\d{7,8})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 상품 고르기 + 구매자 정보 + 결제 동의 + 포트원 결제창(KG이니시스, 카드).
// 결제가 끝나면 /credits/complete가 포트원에 결제를 조회해 씨앗을 주고 결제 완료 화면으로 보낸다.
// failed: 결제창을 닫았거나 실패해 이 화면으로 돌아왔을 때의 사유 (/credits/complete가 붙여 준다)
export function PaymentWidget({ defaultEmail, failed }: { defaultEmail: string; failed: string | null }) {
  const [product, setProduct] = useState<Product>(PRODUCTS[0]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [agreed, setAgreed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(failed);

  async function pay() {
    // KG이니시스 PC 결제창은 구매자 이름·휴대폰 번호·이메일이 필수다
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name.trim()) return setMessage('구매자 이름을 적어 주세요.');
    if (!PHONE.test(phoneDigits)) return setMessage('휴대폰 번호를 확인해 주세요.');
    if (!EMAIL.test(email.trim())) return setMessage('이메일 주소를 확인해 주세요.');
    if (!agreed) return setMessage('결제 내용과 환불 안내를 확인하고 동의해 주세요.');

    setPaying(true);
    setMessage(null);
    let leaving = false;
    try {
      // 1. 서버에 주문을 만든다. 금액은 서버가 상품 목록으로 정한다
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || typeof json?.orderId !== 'string') {
        setMessage(json?.error ?? '주문을 만들지 못했습니다.');
        return;
      }
      const order = json as OrderResponse;

      // 2. 주문번호를 포트원 paymentId로 써서 결제창을 연다.
      //    모바일은 결제창에서 redirectUrl로 넘어가므로 아래 코드까지 오지 않는다
      const response = await PortOne.requestPayment({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: order.orderId,
        orderName: order.orderName,
        totalAmount: order.amount,
        currency: 'KRW',
        payMethod: 'CARD',
        customer: { fullName: name.trim(), phoneNumber: phoneDigits, email: email.trim() },
        redirectUrl: `${window.location.origin}/credits/complete`,
        // KG이니시스 카드 결제는 기본으로 1,000원 미만을 막는다. 한 개(990원)를 팔려고 허용 옵션을 켠다 (PC·모바일 따로)
        bypass: { inicis_v2: { acceptmethod: ['below1000'], P_RESERVED: ['below1000=Y'] } },
      });
      if (!response) return;

      // 3. PC: 결제창이 닫혔다. 닫았거나 실패했으면 사유를 보여 주고, 결제됐으면 서버 확인으로 넘어간다
      if (response.code) {
        setMessage(response.message ?? '결제가 끝나지 않았습니다.');
        return;
      }
      // /credits/complete는 화면이 아니라 서버 주소(결제 확인 뒤 다른 화면으로 보냄)라서 페이지째 이동한다
      leaving = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/credits/complete?paymentId=${encodeURIComponent(response.paymentId)}`);
    } catch (error) {
      console.error('결제 요청 오류', error);
      setMessage(error instanceof Error ? error.message : '결제를 시작하지 못했습니다.');
    } finally {
      if (!leaving) setPaying(false);
    }
  }

  return (
    <section>
      <ul className="products">
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={p.id === product.id ? 'product on' : 'product'}
              aria-pressed={p.id === product.id}
              disabled={paying}
              onClick={() => setProduct(p)}
            >
              <span className="product-name">{p.name}</span>
              <span className="product-sub">씨앗 {p.seeds}개</span>
              <span className="product-sub">
                {(p.seeds * CHARS_PER_SEED).toLocaleString('ko-KR')}자까지
              </span>
              <span className="product-sub">
                개당 {Math.round(p.price / p.seeds).toLocaleString('ko-KR')}원
              </span>
              <span className="product-price">{p.price.toLocaleString('ko-KR')}원</span>
            </button>
          </li>
        ))}
      </ul>

      <fieldset className="buyer" disabled={paying}>
        <legend>구매자 정보</legend>
        <label>
          이름
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={30} />
        </label>
        <label>
          휴대폰 번호
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="01012345678"
            maxLength={13}
          />
        </label>
        <label>
          이메일
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
        </label>
        <p className="buyer-note">
          결제대행사(포트원, KG이니시스) 결제창에 필요한 정보입니다. 결제대행사에만 전달되고 교정햄은
          저장하지 않습니다.
        </p>
      </fieldset>

      {/* 미리 체크해 두지 않는다 (전자상거래법 다크패턴 금지) */}
      <label className="credits-agree">
        <input type="checkbox" checked={agreed} disabled={paying} onChange={(e) => setAgreed(e.target.checked)} />
        고른 상품과 가격, 아래 이용 기간·환불 안내를 확인했고 결제에 동의합니다.
      </label>

      {message && (
        <p className="credits-error" role="alert">
          {message}
        </p>
      )}
      <button type="button" className="primary credits-pay" disabled={paying} onClick={pay}>
        {paying ? '결제창을 여는 중입니다' : `${product.price.toLocaleString('ko-KR')}원 결제하기`}
      </button>
    </section>
  );
}
