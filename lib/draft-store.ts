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


// 입력 글을 쓴 계정. 로그인하기 전에 쓴 글이면 비어 있다
const OWNER_KEY = 'gyojeongham:owner';

// 지금 로그인한 계정(없으면 null)과 글 주인을 맞춘다.
// 주인이 있었는데 지금 계정과 다르면(로그아웃·로그인 만료·다른 계정) 이 탭의 글을 지우고 true를 돌려준다.
// 로그인하기 전에 쓴 글(주인 없음)은 로그인하면 그 계정의 글이 된다 (로그인하러 갔다 와도 남도록)
export function syncDraftOwner(current: string | null): boolean {
  let owner: string | null = null;
  try {
    owner = sessionStorage.getItem(OWNER_KEY);
  } catch {
    // sessionStorage를 못 쓰면 글도 메모리에만 있어서 새로 고치면 어차피 사라진다
  }
  const changed = owner !== null && owner !== current;
  if (changed) setDraft('');
  try {
    if (current) sessionStorage.setItem(OWNER_KEY, current);
    else sessionStorage.removeItem(OWNER_KEY);
  } catch {
    // 위와 같다
  }
  return changed;
}