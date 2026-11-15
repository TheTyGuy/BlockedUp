/**
 * GameSession: the only place the UI touches the engine's reducer.
 *
 * The UI calls `dispatch(action)`; the session runs `engine.apply`, stores the
 * new state and notifies listeners with the resulting events. Views never
 * mutate state or decide game rules themselves.
 *
 * Multiplayer builds on this: a match (see src/net) listens to a session to
 * send the player's actions to the opponent, and dispatches remote actions
 * (incoming junk) into it.
 */
import { apply, type Action, type GameEvent, type GameState } from '../../engine';
import type { DifficultyId } from '../../data/difficulties';

export type SessionMode =
  | { kind: 'endless'; difficulty: DifficultyId }
  | { kind: 'mission'; levelId: string }
  | { kind: 'versus'; player: number };

export type SessionListener = (events: GameEvent[], state: GameState, action: Action) => void;

export class GameSession {
  private listeners = new Set<SessionListener>();

  constructor(
    public state: GameState,
    public readonly mode: SessionMode,
  ) {}

  dispatch(action: Action): GameEvent[] {
    const { state, events } = apply(this.state, action);
    this.state = state;
    for (const l of this.listeners) l(events, state, action);
    return events;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
