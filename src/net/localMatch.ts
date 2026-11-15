/**
 * LocalMatch: a two-player Garbage Attack match on ONE device.
 *
 * It plays the role the network will play later: both players start from the
 * same seed (so they are dealt the same pieces), and when one player's
 * placement emits `garbageSent`, the junk is delivered to the other player as
 * a `receiveGarbage` action. The Firebase version will keep this exact flow
 * and only change how the attack travels between the two sessions.
 */
import { createGame } from '../engine';
import { garbageAttackConfig } from '../data/versus';
import { GameSession } from '../ui/game/session';

export type PlayerIndex = 0 | 1;

export class LocalMatch {
  readonly sessions: [GameSession, GameSession];
  /** Junk cells each player has sent so far. */
  readonly sent: [number, number] = [0, 0];
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

  destroy(): void {
    for (const u of this.unsubs) u();
  }
}
