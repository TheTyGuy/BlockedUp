import { describe, expect, it } from 'vitest';
import {
  apply,
  createGame,
  garbageFor,
  previewPlacement,
  type Action,
  type GameState,
} from '../src/engine';
import { findFullLines } from '../src/engine/board';
import { GARBAGE_ATTACK, garbageAttackConfig } from '../src/data/versus';
import { makeState } from './helpers';

const EMPTY8 = Array(8).fill('........');
const versus = { versus: GARBAGE_ATTACK };
const landOnly = { versus: { ...GARBAGE_ATTACK, smashChance: 0 } };
const smashOnly = { versus: { ...GARBAGE_ATTACK, smashChance: 1 } };
const blocks = (s: GameState) => s.board.cells.filter((c) => c?.kind === 'block').length;
const stones = (s: GameState) => s.board.cells.filter((c) => c?.kind === 'obstacle').length;

describe('garbage amounts', () => {
  it('single lines send nothing; multi-clears and combos send more', () => {
    expect(garbageFor(GARBAGE_ATTACK, 0, 0)).toBe(0);
    expect(garbageFor(GARBAGE_ATTACK, 1, 1)).toBe(0);
    expect(garbageFor(GARBAGE_ATTACK, 2, 1)).toBe(2);
    expect(garbageFor(GARBAGE_ATTACK, 3, 1)).toBe(4);
    expect(garbageFor(GARBAGE_ATTACK, 1, 3)).toBe(2); // combo bonus only
    expect(garbageFor(GARBAGE_ATTACK, 2, 3)).toBe(4);
  });

  it('is capped and handles more lines than the table lists', () => {
    expect(garbageFor(GARBAGE_ATTACK, 20, 1)).toBe(10);
    expect(garbageFor(GARBAGE_ATTACK, 6, 50)).toBe(GARBAGE_ATTACK.maxPerAttack);
  });
});

describe('sending garbage', () => {
  const board = ['rrrrrrr.', 'rrrrrrr.', ...EMPTY8.slice(2, 7), 'g.......'];

  it('a multi-clear in a versus game emits garbageSent', () => {
    const s = makeState({ board, hand: ['I2-1', 'dot-0', 'dot-0'], config: versus });
    const { events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(events).toContainEqual({ type: 'garbageSent', cells: 2 });
  });

  it('a plain single clear sends nothing', () => {
    const s = makeState({ board, hand: ['dot-0', 'dot-0', 'dot-0'], config: versus });
    const { events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(events.some((e) => e.type === 'garbageSent')).toBe(false);
  });

  it('single-player games never emit garbageSent', () => {
    const s = makeState({ board, hand: ['I2-1', 'dot-0', 'dot-0'] });
    const { events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(events.some((e) => e.type === 'garbageSent')).toBe(false);
  });
});

describe('receiving garbage', () => {
  it('drops the requested number of stones into empty cells', () => {
    const s = makeState({ board: EMPTY8, hand: ['dot-0', 'dot-0', 'dot-0'], config: versus });
    const { state, events } = apply(s, { type: 'receiveGarbage', cells: 5 });
    expect(stones(state)).toBe(5);
    expect(events[0]).toMatchObject({ type: 'garbageReceived' });
    if (events[0].type === 'garbageReceived') expect(events[0].cells).toHaveLength(5);
    expect(stones(s)).toBe(0); // input not mutated
    expect(state.placements).toBe(0); // not a placement
  });

  it('is deterministic for the same state', () => {
    const s = makeState({ board: EMPTY8, hand: ['dot-0', 'dot-0', 'dot-0'], config: versus });
    const a = apply(s, { type: 'receiveGarbage', cells: 6 });
    const b = apply(s, { type: 'receiveGarbage', cells: 6 });
    expect(a).toEqual(b);
    expect(a.state.rng).not.toBe(s.rng);
  });

  it('never completes a row or column', () => {
    const s = makeState({
      board: ['rrrrrrr.', ...EMPTY8.slice(1)],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: landOnly,
    });
    const { state } = apply(s, { type: 'receiveGarbage', cells: 30 });
    expect(findFullLines(state.board)).toEqual({ rows: [], cols: [] });
    expect(state.board.cells[7]).toBeNull(); // the one gap in row 0 was left alone
    expect(stones(state)).toBe(30);
  });

  it('ends the game if nothing in hand fits afterwards', () => {
    const s = makeState({ board: EMPTY8, hand: ['O3-0', null, null], config: versus });
    const { state, events } = apply(s, { type: 'receiveGarbage', cells: 64 });
    expect(state.status).toBe('lost');
    expect(events.at(-1)).toEqual({ type: 'gameOver', reason: 'noFit' });
  });

  it('rejects bad amounts and finished games', () => {
    const s = makeState({ board: EMPTY8, hand: ['dot-0', null, null], config: versus });
    for (const cells of [-1, 2.5, 65, NaN]) {
      expect(apply(s, { type: 'receiveGarbage', cells }).events[0].type).toBe('invalidAction');
    }
    const over = { ...s, status: 'lost' as const };
    expect(apply(over, { type: 'receiveGarbage', cells: 1 }).events[0].type).toBe('invalidAction');
  });

  it('received stones clear with lines like any obstacle', () => {
    const s = makeState({
      board: ['#rrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: versus,
    });
    const { state } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(stones(state)).toBe(0);
  });
});

describe('smashing junk', () => {
  const board = ['rrrr....', 'gg......', ...EMPTY8.slice(2, 7), '#.......'];

  it('breaks off coloured blocks instead of adding stones', () => {
    const s = makeState({ board, hand: ['dot-0', 'dot-0', 'dot-0'], config: smashOnly });
    const { state, events } = apply(s, { type: 'receiveGarbage', cells: 3 });
    expect(blocks(state)).toBe(blocks(s) - 3);
    expect(stones(state)).toBe(1); // the existing stone is untouched, none added
    const e = events[0];
    if (e.type !== 'garbageReceived') throw new Error('expected garbageReceived');
    expect(e.cells).toHaveLength(0);
    expect(e.smashed).toHaveLength(3);
    for (const c of e.smashed) {
      expect(c.cell.kind).toBe('block');
      expect(state.board.cells[c.row * 8 + c.col]).toBeNull();
    }
  });

  it('never smashes stones, and lands as stone when nothing can be smashed', () => {
    const s = makeState({
      board: ['#.......', ...EMPTY8.slice(1)],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: smashOnly,
    });
    const { state } = apply(s, { type: 'receiveGarbage', cells: 2 });
    expect(stones(state)).toBe(3);
  });

  it('smashes when there is nowhere left to land', () => {
    // Every row and column has exactly one gap, so no stone may land.
    const full = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => (c === r ? '.' : 'r')).join(''),
    );
    const s = makeState({ board: full, hand: ['dot-0', 'dot-0', 'dot-0'], config: landOnly });
    const { state, events } = apply(s, { type: 'receiveGarbage', cells: 1 });
    expect(events[0]).toMatchObject({ type: 'garbageReceived', cells: [] });
    expect(blocks(state)).toBe(blocks(s) - 1);
  });

  it('a mixed attack does both, deterministically, and never completes a line', () => {
    const busy = Array.from({ length: 8 }, (_, r) => (r % 2 ? 'rrrr....' : '....gggg'));
    const s = makeState({ board: busy, hand: ['dot-0', 'dot-0', 'dot-0'], config: versus });
    const a = apply(s, { type: 'receiveGarbage', cells: 10 });
    expect(a).toEqual(apply(s, { type: 'receiveGarbage', cells: 10 }));
    const e = a.events[0];
    if (e.type !== 'garbageReceived') throw new Error('expected garbageReceived');
    expect(e.cells.length + e.smashed.length).toBe(10);
    expect(e.cells.length).toBeGreaterThan(0);
    expect(e.smashed.length).toBeGreaterThan(0);
    expect(findFullLines(a.state.board)).toEqual({ rows: [], cols: [] });
  });
});

describe('two phones stay in sync', () => {
  const firstMove = (s: GameState): Action | null => {
    for (let h = 0; h < s.hand.length; h++) {
      for (let r = 0; r < s.board.height; r++) {
        for (let c = 0; c < s.board.width; c++) {
          if (previewPlacement(s, h, r, c).valid) {
            return { type: 'place', handIndex: h, row: r, col: c };
          }
        }
      }
    }
    return null;
  };

  it("replaying a player's action log reproduces their exact board", () => {
    const seed = 424242;
    // Phone A plays, receiving garbage now and then; its actions go into a log
    // (this is what gets written to the room in Firebase).
    let a = createGame(garbageAttackConfig(), seed);
    const log: Action[] = [];
    for (let i = 0; i < 40 && a.status === 'playing'; i++) {
      const action: Action = i % 7 === 3 ? { type: 'receiveGarbage', cells: 3 } : firstMove(a)!;
      a = apply(a, action).state;
      log.push(action);
    }
    // Phone B rebuilds A's board from the shared seed + the log (after a JSON trip).
    let mirror = createGame(garbageAttackConfig(), seed);
    for (const action of JSON.parse(JSON.stringify(log)) as Action[]) {
      mirror = apply(mirror, action).state;
    }
    expect(mirror).toEqual(a);
    expect(stones(a)).toBeGreaterThan(0);
  });

  it('both players are dealt the same opening hand from a shared seed', () => {
    const p1 = createGame(garbageAttackConfig(), 99);
    const p2 = createGame(garbageAttackConfig(), 99);
    expect(p1.hand).toEqual(p2.hand);
  });
});
