/**
 * GameSession: the only place the UI touches the engine's reducer.
 *
 * The UI calls `dispatch(action)`; the session runs `engine.apply`, stores the
 * new state and notifies listeners with the resulting events. Views never
 * mutate state or decide game rules themselves.
 *
 * Phase 2: a networked session can implement the same interface — sending
 * local actions to the peer/server and feeding remote actions (garbage, gifts)
 * back through the same `apply` → events path.
 */
import { apply, type Action, type GameEvent, type GameState } from '../../engine';
import type { DifficultyId } from '../../data/difficulties';

export type SessionMode =
  | { kind: 'endless'; difficulty: DifficultyId }
  | { kind: 'mission'; levelId: string }
  | { kind: 'versus'; player: number };

export type SessionListener = (events: GameEvent[], state: GameState) => void;

export class GameSession {
  private listeners = new Set<SessionListener>();

  constructor(
    public state: GameState,
    public readonly mode: SessionMode,
  ) {}

  dispatch(action: Action): GameEvent[] {
    const { state, events } = apply(this.state, action);
    this.state = state;
    for (const l of this.listeners) l(events, state);
    return events;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
