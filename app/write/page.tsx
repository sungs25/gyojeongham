'use client';

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from 'react';
import { preload } from 'react-dom';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { applyChanges, buildSegments } from '@/lib/derive';
import { runQueue } from '@/lib/queue';
import { costKrw, summarize } from '@/lib/cost';
import { initialState, reducer, type Usage } from './reducer';
import type { Chunk } from './types';
import { ruleName } from '@/lib/rules';
import { groupByAxis } from '@/lib/axes';
import { buildChangeList, buildRedline } from '@/lib/copy';
import { ChunkError, createJob, fetchJob, requestChunk } from '@/lib/proofread-client';
import { clearJob, loadJob, saveJob, type SavedJob } from '@/lib/job-store';
import { SiteHeader } from '@/app/components/SiteHeader';
import { HAMSTER_SRCS, Hamster } from '@/app/components/Hamster';
import { getDraft, getServerDraft, setDraft, subscribeDraft } from '@/lib/draft-store';

const CONCURRENCY = 10;
// 청크당 최대 시도 횟수. 서버(finish_chunk)는 3회째 실패에서 씨앗을 반환하므로 반드시 3
const RETRY_LIMIT = 3;

// 개발 중에만 원가·토큰을 하단 바에 띄운다. 배포 빌드에서는 꺼진다.
const DEV_METRICS = process.env.NODE_ENV === 'development';

// 되찾는 중 표시(layout.tsx가 붙인다)를 뗀다. 입력 화면이나 결과 화면이 다시 보인다
function endResuming() {
  delete document.documentElement.dataset.resuming;
}

// 서버에서 되찾은 문단은 이 화면에서 토큰을 쓰지 않았다
const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
};

export default function WritePage() {
  // 햄스터 그림을 화면을 열 때 미리 받아 둔다. 교정이 시작되면 오래 걸리는 요청 10개가
  // 브라우저의 동시 연결을 다 차지해서, 그때 그림을 요청하면 요청이 끝날 때까지 안 뜬다
  for (const src of HAMSTER_SRCS) preload(src, { as: 'image' });
  const [state, dispatch] = useReducer(reducer, initialState);
  // 입력 중인 글은 탭 안 저장소에 둔다 (로그인하러 갔다 와도 남도록)
  const draft = useSyncExternalStore(subscribeDraft, getDraft, getServerDraft);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState<'result' | 'redline' | 'list' | null>(null);
  // 좁은 화면에서 복사 버튼 셋을 접어 둔 메뉴가 열려 있는지
  const [copyOpen, setCopyOpen] = useState(false);
  // 로그인·씨앗·반환 안내 문구
  const [notice, setNotice] = useState<string | null>(null);
  // 작업을 만드는 중 (교정하기 버튼 연타로 작업이 두 개 생기는 것을 막는다)
  const [starting, setStarting] = useState(false);
  // 올리면 계정 표시가 잔액을 다시 읽는다
  const [balanceVersion, setBalanceVersion] = useState(0);

  // 본문 하이라이트: 같은 변경을 다시 누르면 선택 해제, 새로 누르면 선택하고 패널을 연다
  function toggleFocus(id: string) {
    if (focusedId === id) {
      setFocusedId(null);
      return;
    }
    setFocusedId(id);
    setPanelOpen(true);
  }

  // 패널 항목: 선택하고 원문 쪽 하이라이트로 스크롤한다
  function selectFromPanel(id: string) {
    setFocusedId(id);
    document
      .querySelector(`.mark.before[data-change-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function copy(kind: 'result' | 'redline' | 'list') {
    try {
      if (kind === 'redline') {
        const { html, text } = buildRedline(state.source, state.changes);
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        const text =
          kind === 'result'
            ? applyChanges(state.source, state.changes)
            : buildChangeList(state.changes);
        await navigator.clipboard.writeText(text);
      }
      setCopied(kind);
      setTimeout(() => setCopied((v) => (v === kind ? null : v)), 1500);
    } catch (error) {
      console.warn('복사 실패', error);
    }
  }

  const segments = useMemo(
    () => buildSegments(state.source, state.changes),
    [state.source, state.changes],
  );

  const axes = useMemo(() => groupByAxis(state.changes), [state.changes]);

  // 문단들을 서버로 보낸다. 성공한 문단 번호와, 멈춰야 할 때의 안내 문구를 돌려준다
  // (작업이 반환됐거나 로그인이 풀리면 남은 문단은 보내지 않는다)
  async function sendChunks(
    jobId: string,
    chunks: Chunk[],
  ): Promise<{ done: Set<number>; stopMessage: string | null }> {
    const done = new Set<number>();
    let stopMessage: string | null = null;

    await runQueue(chunks, CONCURRENCY, async (chunk) => {
      if (stopMessage) {
        dispatch({ type: 'chunk-error', index: chunk.index });
        return;
      }
      dispatch({ type: 'chunk-running', index: chunk.index });

      for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
        try {
          const { raws, usage } = await requestChunk(jobId, chunk.text);
          dispatch({ type: 'chunk-done', index: chunk.index, raws, usage });
          done.add(chunk.index);
          return;
        } catch (error) {
          console.warn(`청크 ${chunk.index} 시도 ${attempt} 실패`, error);
          // 네트워크 오류처럼 서버 응답이 없는 실패는 다시 보낸다
          const retryable = !(error instanceof ChunkError) || error.retryable;
          if (error instanceof ChunkError && error.stopMessage) {
            stopMessage = error.stopMessage;
          }
          if (!retryable || stopMessage || attempt === RETRY_LIMIT) {
            dispatch({ type: 'chunk-error', index: chunk.index });
            return;
          }
        }
      }
    });

    return { done, stopMessage };
  }

  async function run() {
    if (state.running || starting) return;

    const source = cleanSource(draft);
    const chunks = splitIntoChunks(source);
    if (chunks.length === 0) return;

    // 1. 서버에 작업을 만들고 씨앗을 잡는다
    setNotice(null);
    setStarting(true);
    const job = await createJob(source);
    setStarting(false);
    if (!job.ok) {
      setNotice(job.message);
      return;
    }

    dispatch({ type: 'start', source, chunks });
    // 새로 고쳐도 이 작업을 되찾을 수 있게 탭 안에 기억해 둔다
    saveJob({ jobId: job.jobId, source });
    // 씨앗이 잡혔으니 잔액을 다시 읽는다
    setBalanceVersion((v) => v + 1);

    const { stopMessage } = await sendChunks(job.jobId, chunks);

    dispatch({ type: 'finish' });
    if (stopMessage) setNotice(stopMessage);
    // 실패로 반환됐을 수 있으니 한 번 더 읽는다
    setBalanceVersion((v) => v + 1);
  }

  // 새로 고친 뒤: 기억해 둔 작업의 결과를 서버에서 다시 받아 오고, 안 보낸 문단은 이어서 보낸다
  async function resume(saved: SavedJob) {
    const first = await fetchJob(saved.jobId);
    if (!first.ok) {
      endResuming();
      if (first.reason === 'gone') {
        clearJob();
      } else if (first.reason === 'login') {
        setNotice('로그인이 풀렸습니다. 다시 로그인하면 교정 결과를 다시 불러옵니다.');
      } else {
        setNotice('교정 결과를 다시 불러오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.');
      }
      return;
    }

    const job = first.job;
    const chunks = splitIntoChunks(saved.source);
    if (chunks.length !== job.chunks.length) {
      endResuming();
      clearJob();
      return;
    }
    // 끝난 문단의 결과가 다 남아 있지 않으면 보관 기간(24시간)이 지난 것
    const doneOnServer = job.chunks.filter((c) => c.status === 'done').length;
    if (job.results.length < doneOnServer) {
      endResuming();
      clearJob();
      setNotice('보관 기간(24시간)이 지나 교정 결과를 다시 불러올 수 없습니다.');
      return;
    }

    dispatch({ type: 'start', source: saved.source, chunks });
    const restored = new Set<number>();
    const restore = (results: typeof job.results) => {
      for (const r of results) {
        if (restored.has(r.idx) || !chunks[r.idx]) continue;
        restored.add(r.idx);
        dispatch({ type: 'chunk-done', index: r.idx, raws: r.changes, usage: EMPTY_USAGE });
      }
    };
    restore(job.results);
    for (const c of job.chunks) {
      if (c.status === 'failed') dispatch({ type: 'chunk-error', index: c.idx });
    }

    let stopMessage: string | null = null;
    if (job.status === 'held') {
      // 아직 안 끝난 문단만 다시 보낸다
      const rest = chunks.filter(
        (c) => !restored.has(c.index) && job.chunks[c.index]?.status === 'pending',
      );
      const sent = await sendChunks(saved.jobId, rest);
      stopMessage = sent.stopMessage;
      sent.done.forEach((idx) => restored.add(idx));
      // 새로 고치기 전에 보낸 문단이 그사이 서버에서 끝났을 수 있으니, 남은 결과로 한 번 더 채운다
      const again = await fetchJob(saved.jobId);
      if (again.ok) restore(again.job.results);
    } else if (job.status === 'released') {
      stopMessage = '교정을 끝내지 못해 씨앗을 모두 돌려드렸습니다.';
    } else if (job.chunks.some((c) => c.status === 'failed')) {
      // 오래 멈춰 정산된 작업: 끝난 문단 분량만큼만 씨앗을 쓰고 나머지는 돌려줬다
      stopMessage = '오래 멈춰 있던 문단은 교정하지 못했습니다. 교정한 분량만큼만 씨앗을 썼습니다.';
    }

    dispatch({ type: 'finish' });
    if (stopMessage) setNotice(stopMessage);
    setBalanceVersion((v) => v + 1);
  }

  // 새로 고침·다시 들어옴: 기억해 둔 작업이 있으면 되찾는다
  const resumeSaved = useEffectEvent((saved: SavedJob) => {
    void resume(saved);
  });
  useEffect(() => {
    const saved = loadJob();
    if (!saved) {
      endResuming();
      return;
    }
    // 화면을 한 번 그린 뒤에 시작한다. 개발 모드에서 두 번 불려도 앞의 예약은 취소돼 한 번만 돈다
    const timer = setTimeout(() => resumeSaved(saved), 0);
    // 서버 응답이 너무 늦으면 일단 입력 화면을 보여 준다
    const fallback = setTimeout(endResuming, 10000);
    return () => {
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, []);

  // 결과 화면이 그려지면, 화면에 보이기 전에 되찾는 중 표시를 뗀다
  useLayoutEffect(() => {
    if (state.chunks.length > 0) endResuming();
  }, [state.chunks.length]);

  // 교정 중에 창을 닫거나 새로 고치려 하면 브라우저가 한 번 묻게 한다
  useEffect(() => {
    if (!state.running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.running]);

  const doneCount = state.chunkStates.filter((s) => s === 'done' || s === 'error').length;
  const errorCount = state.chunkStates.filter((s) => s === 'error').length;
  const appliedCount = state.changes.filter((c) => c.applied).length;
  const cost = Math.round(costKrw(state.usages));
  const u = summarize(state.usages);
  const focused = state.changes.find((c) => c.id === focusedId) ?? null;

    if (state.chunks.length === 0) {
    return (
      <main className="page">
        <SiteHeader refreshKey={balanceVersion} />
        <div className="editor">
          {/* 안내 문구(로그인·씨앗 부족 등)가 있으면 햄스터가 대신 말한다 */}
          <Hamster scene="ready" line={notice ?? '이 교정햄에게 맡겨줘! 뭐든지 다 해줄게.'} />
          <textarea
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="교정할 글을 붙여 넣으세요."
            spellCheck={false}
          />
        </div>
        <div className="bar">
          <span className="meta">
              {draft.length.toLocaleString()}자
          </span>
          <button
            className="primary"
            disabled={draft.trim().length === 0 || starting}
            onClick={run}
          >
            {starting ? '시작하는 중...' : '교정하기'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`page ${panelOpen ? 'panel-open' : ''}`}
      onClick={(e) => {
        // 하이라이트·설명·패널·하단 바 바깥을 누르면 선택을 풀고, 열린 복사 메뉴를 닫는다
        if ((e.target as HTMLElement).closest('.mark, .note, .panel, .bar')) return;
        setFocusedId(null);
        setCopyOpen(false);
      }}
    >
      <SiteHeader refreshKey={balanceVersion} />
      <div className="split">
        <section className="pane">
          <h2 className="pane-title">원문</h2>
          <div className="text">
            {segments.map((segment) =>
              segment.type === 'plain' ? (
                <span key={segment.key}>{segment.text}</span>
              ) : (
                <span
                  key={segment.key}
                  data-change-id={segment.change.id}
                  role="button"
                  tabIndex={0}
                  className={`mark before ${focusedId === segment.change.id ? 'focus' : ''}`}
                  onClick={() => toggleFocus(segment.change.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleFocus(segment.change.id);
                    }
                  }}
                >
                  {segment.change.before}
                </span>
              ),
            )}
          </div>
        </section>

        <section className="pane">
          <h2 className="pane-title">교정본</h2>
          <div className="text">
            {segments.map((segment) =>
              segment.type === 'plain' ? (
                <span key={segment.key}>{segment.text}</span>
              ) : (
                <span
                  key={segment.key}
                  data-change-id={segment.change.id}
                  role="button"
                  tabIndex={0}
                  className={`mark after ${focusedId === segment.change.id ? 'focus' : ''}`}
                  onClick={() => toggleFocus(segment.change.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleFocus(segment.change.id);
                    }
                  }}
                  title={segment.change.note}
                >
                  {segment.change.after}
                </span>
              ),
            )}
          </div>
        </section>
      </div>

      <aside className={`panel ${panelOpen ? 'open' : ''}`} inert={!panelOpen}>
        <header className="panel-head">
          <span>변경 {state.changes.length}건</span>
          <button className="ghost" onClick={() => setPanelOpen(false)}>
            닫기
          </button>
        </header>

        {focused && (
          <section className="panel-selected">
            <p className="panel-rules">{focused.ruleIds.map(ruleName).join(' · ')}</p>
            <p className="panel-diff">
              <del>{focused.before}</del> → <ins>{focused.after}</ins>
            </p>
            <p className="panel-note">{focused.note}</p>
            <button className="ghost" onClick={() => dispatch({ type: 'toggle', id: focused.id })}>
              {focused.applied ? '되돌리기' : '다시 적용'}
            </button>
          </section>
        )}

        <div className="panel-list">
          {axes.map((axis) => (
            <details key={axis.id} className="axis">
              <summary className="axis-head">
                <span>{axis.name}</span>
                <span className="axis-count">
                  {axis.changes.length}건
                  {axis.revertedCount > 0 && ` · 되돌림 ${axis.revertedCount}`}
                </span>
                <button
                  className="ghost small"
                  onClick={(e) => {
                    // summary 안의 버튼이라 접기·펼치기가 같이 일어나지 않게 막는다
                    e.preventDefault();
                    const allReverted = axis.revertedCount === axis.changes.length;
                    dispatch({
                      type: 'set-applied',
                      ids: axis.changes.map((c) => c.id),
                      applied: allReverted,
                    });
                  }}
                >
                  {axis.revertedCount === axis.changes.length ? '모두 다시 적용' : '모두 되돌리기'}
                </button>
              </summary>
              <ul className="axis-items">
                {axis.changes.map((c) => (
                  <li
                    key={c.id}
                    className={`panel-item ${c.applied ? '' : 'off'} ${focusedId === c.id ? 'focus' : ''}`}
                  >
                    <button className="panel-pick" onClick={() => selectFromPanel(c.id)}>
                      <del>{c.before}</del> → <ins>{c.after}</ins>
                    </button>
                    <button
                      className="ghost small"
                      onClick={() => dispatch({ type: 'toggle', id: c.id })}
                    >
                      {c.applied ? '되돌리기' : '다시 적용'}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </aside>

      {/* 교정 중에는 화면 가운데서 종이를 비교하고, 끝나면 오른쪽 아래로 가서 짜잔 한다 */}
      {state.running ? (
        <div className="hamster-stage">
          <Hamster
            scene="working"
            line={`꼼꼼히 비교하는 중... (${doneCount}/${state.chunks.length})`}
          />
        </div>
      ) : (
        <Hamster
          // 안내 문구(씨앗 반환 등)는 사라지지 않게 말풍선에 계속 둔다
          className={`hamster-float ${notice ? 'hamster-keep' : ''}`}
          scale={2}
          scene={errorCount > 0 ? 'ready' : 'done'}
          line={notice ?? (errorCount > 0 ? '몇 문단은 끝내 못 고쳤어.' : '짜잔! 다 고쳤어.')}
        />
      )}

      <div className="bar">
        <span className="meta">
          문단 {doneCount}/{state.chunks.length} · 변경 {appliedCount}건
          {state.unmatched.length > 0 && ` · 미매칭 ${state.unmatched.length}건`}
          {state.chunkStates.filter((s) => s === 'error').length > 0 &&
            ` · 실패 ${state.chunkStates.filter((s) => s === 'error').length}개`}
          {state.running ? ' · 교정 중...' : ''}
          {` · ${state.source.length.toLocaleString()}자`}
          {DEV_METRICS && ` · ${cost}원 · 출력 ${u.output.toLocaleString()}`}
          {DEV_METRICS && u.thinking > 0 && ` (사고 ${u.thinking.toLocaleString()})`}
          {DEV_METRICS && ` · 캐시 쓰기 ${u.cacheWrites}/읽기 ${u.cacheReads}`}
        </span>
        <span className="bar-actions">
          <button className="ghost" onClick={() => setPanelOpen((v) => !v)}>
            변경 목록
          </button>
          {/* 좁은 화면에서는 복사 버튼 셋을 "복사" 버튼 하나 아래로 접는다 */}
          <button
            className="ghost copy-toggle"
            disabled={state.running}
            onClick={() => setCopyOpen((v) => !v)}
          >
            복사
          </button>
          <span className={`copy-group ${copyOpen ? 'open' : ''}`}>
            <button className="ghost" disabled={state.running} onClick={() => copy('result')}>
              {copied === 'result' ? '복사됨' : '교정본 복사'}
            </button>
            <button className="ghost" disabled={state.running} onClick={() => copy('redline')}>
              {copied === 'redline' ? '복사됨' : '대조본 복사'}
            </button>
            <button className="ghost" disabled={state.running} onClick={() => copy('list')}>
              {copied === 'list' ? '복사됨' : '목록 복사'}
            </button>
          </span>
          <button
            className="primary"
            disabled={state.running}
            onClick={() => {
              setNotice(null);
              setCopyOpen(false);
              clearJob();
              dispatch({ type: 'reset' });
            }}
          >
            새 글
          </button>
        </span>
      </div>
    </main>
  );
}
