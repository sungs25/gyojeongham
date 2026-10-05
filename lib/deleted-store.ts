// 탈퇴를 마친 화면에 보여 줄 주문(환불받을 수 있는 결제)을 탭 안(sessionStorage)에 잠시 둔다.
// 탈퇴하면 로그인이 끊겨 서버에서 다시 읽을 수 없기 때문이다. 탭을 닫으면 사라진다.
// 화면은 useSyncExternalStore로 읽는다.
import type { Purchase } from '@/lib/purchases';

const KEY = 'gyojeongham:deleted';
// sessionStorage를 못 쓰는 환경에서는 메모리에만 둔다 (화면 이동은 되지만 새로 고치면 사라진다)
let memory: string | null = null;

export function saveDeleted(purchases: Purchase[]) {
  memory = JSON.stringify(purchases);
  try {
    sessionStorage.setItem(KEY, memory);
  } catch {
    // 위와 같다
  }
}

// 저장된 글자 그대로 돌려준다. 같은 값이면 같은 문자열이라 화면이 쓸데없이 다시 그려지지 않는다
export function getDeletedRaw(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

// 서버에서 그릴 때는 저장된 것이 없다
export function getServerDeletedRaw(): string | null {
  return null;
}

// 이 값은 탈퇴할 때 한 번 쓰고 바뀌지 않으므로 알릴 일이 없다
export function subscribeDeleted() {
  return () => {};
}

export function parseDeleted(raw: string | null): Purchase[] | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as Purchase[]) : null;
  } catch {
    return null;
  }
}
