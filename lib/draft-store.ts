// 입력 중인 글을 탭 안(sessionStorage)에 보관하는 작은 저장소.
// 로그인하러 갔다 와도 글이 남게 하려는 것이고, 탭을 닫으면 사라진다. 서버로는 가지 않는다.
// 화면은 useSyncExternalStore로 이 저장소를 직접 읽는다.

const KEY = 'gyojeongham:draft';
const listeners = new Set<() => void>();
// sessionStorage를 못 쓰는 환경에서는 메모리에만 둔다
let memory = '';

export function subscribeDraft(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDraft(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return memory;
  }
}

// 서버에서 그릴 때는 보관된 글이 없다
export function getServerDraft(): string {
  return '';
}

export function setDraft(text: string) {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    memory = text;
  }
  listeners.forEach((listener) => listener());
}