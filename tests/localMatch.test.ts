import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/net/localMatch';
import type { GameState } from '../src/engine';

const stones = (s: GameState) => s.board.cells.filter((c) => c?.kind === 'obstacle').length;

/** Overwrite a session's board/hand so the next placement is a double clear. */
function rigDoubleClear(match: LocalMatch, player: 0 | 1) {
  const session = match.sessions[player];
  const s = session.state;
  const w = s.board.width;
  const cells = s.board.cells.map((_, i) => {
    const row = Math.floor(i / w);
    const col = i % w;
    if (row < 2 && col < w - 1) return { kind: 'block' as const, color: 'red' as const };
    if (row === s.board.height - 1 && col === 0)
      return { kind: 'block' as const, color: 'green' as const };
    return null;
  });
  session.state = {
    ...s,
    board: { ...s.board, cells },
    hand: [{ id: 500, shapeId: 'I2-1', color: 'blue' }, s.hand[1], s.hand[2]],
  };
  return { type: 'place' as const, handIndex: 0, row: 0, col: w - 1 };
}

describe('LocalMatch', () => {
  it('both players start with the same pieces', () => {
    const m = new LocalMatch(7);
    expect(m.sessions[0].state.hand).toEqual(m.sessions[1].state.hand);
    expect(m.winner()).toBeNull();
  });

  it("delivers one player's attack to the other player's board", () => {
    const m = new LocalMatch(7);
    m.sessions[0].dispatch(rigDoubleClear(m, 0));
    expect(m.sent).toEqual([2, 0]);
    expect(stones(m.sessions[1].state)).toBe(2);
    expect(stones(m.sessions[0].state)).toBe(0);
  });

  it('declares the other player the winner when one runs out of room', () => {
    const m = new LocalMatch(7);
    m.sessions[1].state = { ...m.sessions[1].state, status: 'lost', endReason: 'noFit' };
    expect(m.winner()).toBe(0);
    // No junk is delivered to a finished board.
    m.sessions[0].dispatch(rigDoubleClear(m, 0));
    expect(stones(m.sessions[1].state)).toBe(0);
  });
});
