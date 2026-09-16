'use client';

import { useReducer, useState } from 'react';
import { initialState, reducer } from './reducer';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';

export default function WritePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (!state.running) {
    return (
      <div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button
  disabled={busy}
  onClick={() => {
    const source = cleanSource(draft);
    dispatch({ type: 'start', source });
  }}
>
  {busy ? '교정 중...' : '교정하기'}
</button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ whiteSpace: 'pre-wrap' }}>{state.source}</p>
      <button onClick={() => dispatch({ type: 'reset' })}>새 글</button>
    </div>
  );
}