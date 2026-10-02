'use client';

import { useState } from 'react';
import { cleanSource, splitIntoChunks } from '@/lib/chunk';
import { matchChunkChanges, resolveOverlaps } from '@/lib/match';
import { buildSegments } from '@/lib/derive';
import { ruleName } from '@/lib/rules';
import { SAMPLE_RAWS, SAMPLE_SOURCE } from '@/lib/sample';

// 결과 화면(/write)과 같은 순서로 변경을 원문에 맞춘다
const SOURCE = cleanSource(SAMPLE_SOURCE);
const [CHUNK] = splitIntoChunks(SOURCE);
const CHANGES = resolveOverlaps(matchChunkChanges(SOURCE, CHUNK, SAMPLE_RAWS).matched).matched;
const SEGMENTS = buildSegments(SOURCE, CHANGES);

// 첫 화면 예시: 원문·교정본 두 칸과, 누른 표시의 고친 이유
export function SampleResult() {
  const [focusedId, setFocusedId] = useState(CHANGES[0].id);
  // 좁은 화면에서는 두 칸을 탭으로 하나씩 보여 준다 (쌓으면 고친 이유가 화면 밖으로 밀려난다)
  const [view, setView] = useState<'before' | 'after'>('after');
  const focused = CHANGES.find((c) => c.id === focusedId) ?? CHANGES[0];

  function pane(side: 'before' | 'after') {
    return SEGMENTS.map((segment) =>
      segment.type === 'plain' ? (
        <span key={segment.key}>{segment.text}</span>
      ) : (
        <span
          key={segment.key}
          role="button"
          tabIndex={0}
          aria-pressed={focusedId === segment.change.id}
          className={`mark ${side} ${focusedId === segment.change.id ? 'focus' : ''}`}
          onClick={() => setFocusedId(segment.change.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setFocusedId(segment.change.id);
            }
          }}
        >
          {segment.change[side]}
        </span>
      ),
    );
  }

  return (
    <div className="sample">
      <div className="sample-tabs">
        <button aria-pressed={view === 'before'} onClick={() => setView('before')}>
          고치기 전
        </button>
        <button aria-pressed={view === 'after'} onClick={() => setView('after')}>
          고친 뒤
        </button>
      </div>
      <div className="sample-split">
        <section className={`sample-pane ${view === 'before' ? 'on' : ''}`}>
          <h3 className="pane-title">원문</h3>
          <p className="sample-text">{pane('before')}</p>
        </section>
        <section className={`sample-pane ${view === 'after' ? 'on' : ''}`}>
          <h3 className="pane-title">교정본</h3>
          <p className="sample-text">{pane('after')}</p>
        </section>
      </div>
      <div className="sample-note" aria-live="polite">
        <p className="sample-rules">{focused.ruleIds.map(ruleName).join(' · ')}</p>
        <p className="sample-diff">
          <del>{focused.before}</del> → <ins>{focused.after}</ins>
        </p>
        <p className="sample-why">{focused.note}</p>
      </div>
    </div>
  );
}