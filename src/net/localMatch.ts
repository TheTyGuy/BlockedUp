/**
 * LocalMatch: a two-player Garbage Attack match on ONE device.
 *
 * Both players start from the same seed (so they are dealt the same pieces),
 * and when one player's placement emits `garbageSent`, the junk is delivered
 * to the other player as a `receiveGarbage` action. OnlineMatch keeps this
 * exact flow and only changes how the attack travels between the sessions.
 */
import { createGame } from '../engine';
import { garbageAttackConfig } from '../data/versus';
import { GameSession } from '../ui/game/session';
import type { PlayerIndex, VersusMatch } from './match';

export type { PlayerIndex } from './match';

export class LocalMatch implements VersusMatch {
  readonly sessions: [GameSession, GameSession];
  readonly sent: [number, number] = [0, 0];
  readonly names: [string, string] = ['Player 1', 'Player 2'];
  readonly controls: [boolean, boolean] = [true, true];
  private unsubs: (() => void)[] = [];

  constructor(readonly seed: number) {
    const make = (player: PlayerIndex) =>
      new GameSession(createGame(garbageAttackConfig(), seed), { kind: 'versus', player });
    this.sessions = [make(0), make(1)];

    ([0, 1] as const).forEach((from) => {
      const to = (1 - from) as PlayerIndex;
      this.unsubs.push(
        this.sessions[from].subscribe((events) => {
          for (const e of events) {
            if (e.type !== 'garbageSent') continue;
            this.sent[from] += e.cells;
            if (this.sessions[to].state.status === 'playing') {
              this.sessions[to].dispatch({ type: 'receiveGarbage', cells: e.cells });
            }
          }
        }),
      );
    });
  }

  /** The winner once one player can no longer move, otherwise null. */
  winner(): PlayerIndex | null {
    if (this.sessions[0].state.status === 'lost') return 1;
    if (this.sessions[1].state.status === 'lost') return 0;
    return null;
  }

  notice(): string | null {
    return null;
  }
  onChange(): () => void {
    return () => {};
  }
  leave(): void {}

  destroy(): void {
    for (const u of this.unsubs) u();
  }
}
