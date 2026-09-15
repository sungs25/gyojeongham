import type { Change } from './types';

export type State = {
  source: string;        // 원문. 한 번 정해지면 안 바뀐다
  changes: Change[];
  running: boolean;
};

export const initialState: State = {
  source: '',
  changes: [],
  running: false,
};

export type Action =
  | { type: 'start'; source: string }
  | { type: 'toggle'; id: string }
  | { type: 'reset' };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...initialState, source: action.source, running: true };

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