'use client';

import { useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { applyChanges, buildSegments } from '@/lib/derive';
import { runQueue } from '@/lib/queue';
import { costKrw, summarize } from '@/lib/cost';
import { initialState, reducer } from './reducer';
import { ruleName } from '@/lib/rules';
import { groupByAxis } from '@/lib/axes';
import { buildChangeList, buildRedline } from '@/lib/copy';
import { ChunkError, createJob, requestChunk } from '@/lib/proofread-client';
import { AccountBar } from './AccountBar';
import { getDraft, getServerDraft, setDraft, subscribeDraft } from '@/lib/draft-store';

const CONCURRENCY = 10;
// 청크당 최대 시도 횟수. 서버(finish_chunk)는 3회째 실패에서 씨앗을 반환하므로 반드시 3
const RETRY_LIMIT = 3;

// 개발 중에만 원가·토큰을 하단 바에 띄운다. 배포 빌드에서는 꺼진다.
const DEV_METRICS = process.env.NODE_ENV === 'development';

export default function WritePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // 입력 중인 글은 탭 안 저장소에 둔다 (로그인하러 갔다 와도 남도록)
  const draft = useSyncExternalStore(subscribeDraft, getDraft, getServerDraft);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState<'result' | 'redline' | 'list' | null>(null);
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
    // 씨앗이 잡혔으니 잔액을 다시 읽는다
    setBalanceVersion((v) => v + 1);

    // 작업이 반환됐거나 로그인이 풀리면 남은 청크를 보내지 않는다
    let stopMessage: string | null = null;

    await runQueue(chunks, CONCURRENCY, async (chunk) => {
      if (stopMessage) {
        dispatch({ type: 'chunk-error', index: chunk.index });
        return;
      }
      dispatch({ type: 'chunk-running', index: chunk.index });

      for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
        try {
          const { raws, usage } = await requestChunk(job.jobId, chunk.text);
          dispatch({ type: 'chunk-done', index: chunk.index, raws, usage });
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

    dispatch({ type: 'finish' });
    if (stopMessage) setNotice(stopMessage);
    // 실패로 반환됐을 수 있으니 한 번 더 읽는다
    setBalanceVersion((v) => v + 1);
  }

  const doneCount = state.chunkStates.filter((s) => s === 'done' || s === 'error').length;
  const appliedCount = state.changes.filter((c) => c.applied).length;
  const cost = Math.round(costKrw(state.usages));
  const u = summarize(state.usages);
  const focused = state.changes.find((c) => c.id === focusedId) ?? null;

  if (state.chunks.length === 0) {
    return (
      <main className="page">
        <AccountBar refreshKey={balanceVersion} />
        <div className="editor">
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
            {draft.length.toLocaleString()}자{notice && ` · ${notice}`}
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
        // 하이라이트·설명·패널·하단 바 바깥을 누르면 선택을 푼다
        if ((e.target as HTMLElement).closest('.mark, .note, .panel, .bar')) return;
        setFocusedId(null);
      }}
    >
      <AccountBar refreshKey={balanceVersion} />
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

      <div className="bar">
        <span className="meta">
          문단 {doneCount}/{state.chunks.length} · 변경 {appliedCount}건
          {state.unmatched.length > 0 && ` · 미매칭 ${state.unmatched.length}건`}
          {state.chunkStates.filter((s) => s === 'error').length > 0 &&
            ` · 실패 ${state.chunkStates.filter((s) => s === 'error').length}개`}
          {state.running ? ' · 교정 중...' : ''}
          {` · ${state.source.length.toLocaleString()}자`}
          {notice && ` · ${notice}`}
          {DEV_METRICS && ` · ${cost}원 · 출력 ${u.output.toLocaleString()}`}
          {DEV_METRICS && u.thinking > 0 && ` (사고 ${u.thinking.toLocaleString()})`}
          {DEV_METRICS && ` · 캐시 쓰기 ${u.cacheWrites}/읽기 ${u.cacheReads}`}
        </span>
        <span className="bar-actions">
          <button className="ghost" onClick={() => setPanelOpen((v) => !v)}>
            변경 목록
          </button>
          <button className="ghost" disabled={state.running} onClick={() => copy('result')}>
            {copied === 'result' ? '복사됨' : '교정본 복사'}
          </button>
          <button className="ghost" disabled={state.running} onClick={() => copy('redline')}>
            {copied === 'redline' ? '복사됨' : '대조본 복사'}
          </button>
          <button className="ghost" disabled={state.running} onClick={() => copy('list')}>
            {copied === 'list' ? '복사됨' : '목록 복사'}
          </button>
          <button
            className="primary"
            disabled={state.running}
            onClick={() => {
              setNotice(null);
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
