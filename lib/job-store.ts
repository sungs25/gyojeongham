// 교정 중이거나 끝난 작업을 탭 안(sessionStorage)에 기억해 두는 작은 저장소.
// 새로 고쳐도 같은 작업의 결과를 서버에서 다시 받아 오려는 것이고, 탭을 닫으면 사라진다.
// 원문은 여기에만 두고 서버로는 보내지 않는다 (서버에는 고친 곳 목록만 24시간 남는다).

const KEY = 'gyojeongham:job';

export type SavedJob = { jobId: string; source: string };

export function saveJob(job: SavedJob) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(job));
  } catch {
    // 저장하지 못하면 새로 고침 뒤 되찾기만 안 된다
  }
}

export function loadJob(): SavedJob | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.jobId !== 'string' || typeof value?.source !== 'string') return null;
    return { jobId: value.jobId, source: value.source };
  } catch {
    return null;
  }
}

export function clearJob() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 지우지 못해도 다음 교정에서 덮어쓴다
  }
}