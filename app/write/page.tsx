'use client';

import { useReducer, useState } from 'react';
import { initialState, reducer } from './reducer';

export default function WritePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [draft, setDraft] = useState('');

  if (!state.running) {
    return (
      <div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={() => dispatch({ type: 'start', source: draft })}>
          교정하기
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