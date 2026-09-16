import type { Change, Chunk, RawChange } from './types';

export type ChunkState = 'pending' | 'running' | 'done' | 'error';

export type State = {
  source: string;
  chunks: Chunk[];
  chunkStates: ChunkState[];
  changes: Change[];
  running: boolean;
};

export const initialState: State = {
  source: '',
  chunks: [],
  chunkStates: [],
  changes: [],
  running: false,
};

export type Action =
  | { type: 'start'; source: string; chunks: Chunk[] }
  | { type: 'chunk-running'; index: number }
  | { type: 'chunk-done'; index: number; raws: RawChange[] }
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
      // 매핑은 다음 단계에서. 지금은 받은 것만 쌓는다.
      const received: Change[] = action.raws.map((raw, i) => ({
        id: `${action.index}-${i}`,
        start: -1,
        end: -1,
        before: raw.before,
        after: raw.after,
        ruleId: raw.rule_id,
        note: raw.note,
        applied: true,
      }));

      return {
        ...state,
        chunkStates: setAt(state.chunkStates, action.index, 'done'),
        changes: [...state.changes, ...received],
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