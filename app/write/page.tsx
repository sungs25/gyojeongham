'use client';

import { useMemo, useReducer, useState } from 'react';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { applyChanges, buildSegments } from '@/lib/derive';
import { runQueue } from '@/lib/queue';
import { costKrw, summarize } from '@/lib/cost';
import type { RawChange } from './types';
import { initialState, reducer, type Usage } from './reducer';
import { ruleName } from '@/lib/rules';
import { groupByAxis } from '@/lib/axes';

const CONCURRENCY = 10;
const RETRY_LIMIT = 2;

// 개발 중에만 원가·토큰을 하단 바에 띄운다. 배포 빌드에서는 꺼진다.
const DEV_METRICS = process.env.NODE_ENV === 'development';

async function requestChunk(text: string): Promise<{ raws: RawChange[]; usage: Usage }> {
  const response = await fetch('/api/proofread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? `요청 실패 (${response.status})`);
  if (!Array.isArray(data?.changes)) throw new Error('changes 배열이 없습니다');

  const u = data.usage ?? {};
  return {
    raws: data.changes as RawChange[],
    usage: {
      inputTokens: u.input_tokens ?? 0,
      cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      thinkingTokens: u.output_tokens_details?.thinking_tokens ?? 0,
    },
  };
}

export default function WritePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [draft, setDraft] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
   // 같은 변경을 다시 누르면 설명을 닫는다
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
  // 패널 항목: 선택하고 원문 쪽 하이라이트로 스크롤한다
  function selectFromPanel(id: string) {
    setFocusedId(id);
    document
      .querySelector(`.mark.before[data-change-id="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  const segments = useMemo(
    () => buildSegments(state.source, state.changes),
    [state.source, state.changes],
  );

  const axes = useMemo(() => groupByAxis(state.changes), [state.changes]);

  async function run() {
    if (state.running) return;

    const source = cleanSource(draft);
    const chunks = splitIntoChunks(source);
    if (chunks.length === 0) return;

    dispatch({ type: 'start', source, chunks });

    await runQueue(chunks, CONCURRENCY, async (chunk) => {
      dispatch({ type: 'chunk-running', index: chunk.index });

      for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
        try {
          const { raws, usage } = await requestChunk(chunk.text);
          dispatch({ type: 'chunk-done', index: chunk.index, raws, usage });
          return;
        } catch (error) {
          console.warn(`청크 ${chunk.index} 시도 ${attempt} 실패`, error);
          if (attempt === RETRY_LIMIT) {
            dispatch({ type: 'chunk-error', index: chunk.index });
          }
        }
      }
    });

    dispatch({ type: 'finish' });
  }

  const doneCount = state.chunkStates.filter((s) => s === 'done' || s === 'error').length;
  const appliedCount = state.changes.filter((c) => c.applied).length;
  const cost = Math.round(costKrw(state.usages));
  const u = summarize(state.usages);
  const focused = state.changes.find((c) => c.id === focusedId) ?? null;

  if (state.chunks.length === 0) {
    return (
      <main className="page">
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
          <span className="meta">{draft.length.toLocaleString()}자</span>
          <button className="primary" disabled={draft.trim().length === 0} onClick={run}>
            교정하기
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
          {DEV_METRICS && ` · ${cost}원 · 출력 ${u.output.toLocaleString()}`}
          {DEV_METRICS && u.thinking > 0 && ` (사고 ${u.thinking.toLocaleString()})`}
          {DEV_METRICS && ` · 캐시 쓰기 ${u.cacheWrites}/읽기 ${u.cacheReads}`}
        </span>
        <span className="bar-actions">
          <button className="ghost" onClick={() => setPanelOpen((v) => !v)}>
            변경 목록
          </button>
          <button
            className="ghost"
            disabled={state.running}
            onClick={() => navigator.clipboard.writeText(applyChanges(state.source, state.changes))}
          >
            교정본 복사
          </button>
          <button className="primary" disabled={state.running} onClick={() => dispatch({ type: 'reset' })}>
            새 글
          </button>
        </span>
      </div>
    </main>
  );
}