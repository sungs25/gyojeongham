'use client';

import { useMemo, useReducer, useState } from 'react';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { applyChanges, buildSegments } from '@/lib/derive';
import { runQueue } from '@/lib/queue';
import { costKrw, summarize } from '@/lib/cost';
import type { RawChange } from './types';
import { initialState, reducer, type Usage } from './reducer';
import { ruleName } from '@/lib/rules';

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

  const segments = useMemo(
    () => buildSegments(state.source, state.changes),
    [state.source, state.changes],
  );

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
    <main className="page">
      <div className="split">
        <section className="pane">
          <h2 className="pane-title">원문</h2>
          <div className="text">
            {segments.map((segment) =>
              segment.type === 'plain' ? (
                <span key={segment.key}>{segment.text}</span>
              ) : (
                <button
                  key={segment.key}
                  className={`mark before ${focusedId === segment.change.id ? 'focus' : ''}`}
                  onClick={() => setFocusedId(segment.change.id)}
                >
                  {segment.change.before}
                </button>
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
                <button
                  key={segment.key}
                  className={`mark after ${focusedId === segment.change.id ? 'focus' : ''}`}
                  onClick={() => setFocusedId(segment.change.id)}
                  title={segment.change.note}
                >
                  {segment.change.after}
                </button>
              ),
            )}
          </div>
        </section>
      </div>

      {focused && (
        <aside className="note">
          <p className="note-body">{focused.note}</p>
          <p className="note-meta">
            {focused.before} → {focused.after} ({focused.ruleIds.map(ruleName).join(', ')})
          </p>
          <button className="ghost" onClick={() => dispatch({ type: 'toggle', id: focused.id })}>
            {focused.applied ? '되돌리기' : '다시 적용'}
          </button>
        </aside>
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