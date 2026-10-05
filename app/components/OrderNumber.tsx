'use client';

import { useState } from 'react';

// 주문번호와 복사 버튼. 환불을 요청할 때 이메일에 붙여 넣는 값이다.
// 복사가 막힌 브라우저에서는 번호를 한 번 누르면 전체가 골라지므로(CSS user-select: all) 직접 복사하면 된다
export function OrderNumber({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1500);
  }

  return (
    <span className="order-number">
      <code>{id}</code>
      <button type="button" className="ghost small" onClick={copy}>
        {state === 'copied' ? '복사됨' : state === 'failed' ? '복사 안 됨' : '복사'}
      </button>
    </span>
  );
}
