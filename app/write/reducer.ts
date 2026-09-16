import { matchChunkChanges, resolveOverlaps } from '@/lib/match';
import type { Change, Chunk, RawChange } from './types';

export type ChunkState = 'pending' | 'running' | 'done' | 'error';

export type Usage = {
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  thinkingTokens: number;
};

export type State = {
  source: string;
  chunks: Chunk[];
  chunkStates: ChunkState[];
  changes: Change[];
  unmatched: Change[];
  usages: Usage[];
  running: boolean;
};

export const initialState: State = {
  source: '',
  chunks: [],
  chunkStates: [],
  changes: [],
  unmatched: [],
  usages: [],
  running: false,
};

export type Action =
  | { type: 'start'; source: string; chunks: Chunk[] }
  | { type: 'chunk-running'; index: number }
  | { type: 'chunk-done'; index: number; raws: RawChange[]; usage: Usage }
  | { type: 'chunk-error'; index: number }
  | { type: 'finish' }
  | { type: 'toggle'; id: string }
  | { type: 'reset' };

function setAt<T>(list: T[], index: number, value: T): T[] {
  const next = list.slice();
  next[index] = value;
  return next;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return {
        ...initialState,
        source: action.source,
        chunks: action.chunks,
        chunkStates: action.chunks.map(() => 'pending'),
        running: true,
      };

    case 'chunk-running':
      return { ...state, chunkStates: setAt(state.chunkStates, action.index, 'running') };

    case 'chunk-done': {
      const chunk = state.chunks[action.index];
      if (!chunk) return state;

      const found = matchChunkChanges(state.source, chunk, action.raws);
      const resolved = resolveOverlaps(found.matched);

      return {
        ...state,
        chunkStates: setAt(state.chunkStates, action.index, 'done'),
        changes: [...state.changes, ...resolved.matched].sort((a, b) => a.start - b.start),
        unmatched: [...state.unmatched, ...found.unmatched, ...resolved.unmatched],
        usages: [...state.usages, action.usage],
      };
    }

    case 'chunk-error':
      return { ...state, chunkStates: setAt(state.chunkStates, action.index, 'error') };

    case 'finish':
      return { ...state, running: false };

    case 'toggle':
      return {
        ...state,
        changes: state.changes.map((c) =>
          c.id === action.id ? { ...c, applied: !c.applied } : c,
        ),
      };

    case 'reset':
      return initialState;

    default:
      return state;
  }
}