/**
 * What the versus screen needs from a two-player match, whether both players
 * share one device (LocalMatch) or play on two phones (OnlineMatch).
 */
import type { GameSession } from '../ui/game/session';

export type PlayerIndex = 0 | 1;

export interface VersusMatch {
  /** Both players' games. Online, the opponent's is a live mirror. */
  readonly sessions: [GameSession, GameSession];
  /** Junk cells each player has sent so far. */
  readonly sent: [number, number];
  readonly names: [string, string];
  /** Which boards this device may play (both when sharing a device). */
  readonly controls: [boolean, boolean];
  /** The winner once the match is decided, otherwise null. */
  winner(): PlayerIndex | null;
  /** Extra status to show the player (e.g. "Opponent disconnected"), or null. */
  notice(): string | null;
  /** Called when anything outside the two sessions changes (presence, notices, result). */
  onChange(cb: () => void): () => void;
  /** Give up the match (the opponent wins). No-op where it doesn't apply. */
  leave(): void;
  destroy(): void;
}
