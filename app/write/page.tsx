'use client';

import { useReducer, useState } from 'react';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { runQueue } from '@/lib/queue';
import type { RawChange } from './types';
import { initialState, reducer } from './reducer';

const CONCURRENCY = 10;
const RETRY_LIMIT = 2;

async function requestChunk(text: string): Promise<RawChange[]> {
  const response = await fetch('/api/proofread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? `요청 실패 (${response.status})`);
  if (!Array.isArray(data?.changes)) throw new Error('changes 배열이 없습니다');
  return data.changes as RawChange[];
}

export default function WritePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [draft, setDraft] = useState('');

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
          const raws = await requestChunk(chunk.text);
          dispatch({ type: 'chunk-done', index: chunk.index, raws });
          return;
        } catch (error) {
          if (attempt === RETRY_LIMIT) {
            console.error(`청크 ${chunk.index} 실패`, error);
            dispatch({ type: 'chunk-error', index: chunk.index });
          }
        }
      }
    });

    dispatch({ type: 'finish' });
  }

  const doneCount = state.chunkStates.filter((s) => s === 'done' || s === 'error').length;

  if (state.chunks.length === 0) {
    return (
      <div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          cols={80}
        />
        <div>
          <button disabled={state.running} onClick={run}>
            교정하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p>
        문단 {doneCount}/{state.chunks.length} · 변경 {state.changes.length}건
        {state.running ? ' · 교정 중...' : ' · 완료'}
      </p>

      <ul>
        {state.changes.map((c) => (
          <li key={c.id}>
            {c.before} → {c.after} <small>({c.ruleId}) {c.note}</small>
          </li>
        ))}
      </ul>

      <button disabled={state.running} onClick={() => dispatch({ type: 'reset' })}>
        새 글
      </button>
    </div>
  );
}