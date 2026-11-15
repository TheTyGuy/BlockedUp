import { describe, expect, it } from 'vitest';
import { apply, createGame, handFits, previewPlacement, PIECES, getShape } from '../src/engine';
import { Rng, nextFloat, seedFromString } from '../src/engine/rng';
import { canPlace, clearLines, findFullLines } from '../src/engine/board';
import { clearPoints, comboMultiplier } from '../src/engine/scoring';
import { dealHand } from '../src/engine/generator';
import { endlessConfig, DIFFICULTIES } from '../src/data/difficulties';
import { makeState } from './helpers';

const EMPTY8 = Array(8).fill('........');

describe('seeded RNG', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(50);
  });

  it('produces values in [0,1)', () => {
    let s = 7;
    for (let i = 0; i < 1000; i++) {
      const [v, n] = nextFloat(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      s = n;
    }
  });

  it('differs across seeds and hashes strings stably', () => {
    expect(new Rng(1).float()).not.toBe(new Rng(2).float());
    expect(seedFromString('daily-2026-11-15')).toBe(seedFromString('daily-2026-11-15'));
  });

  it('two games with the same seed deal the same piece sequence', () => {
    const play = (seed: number) => {
      let s = createGame(endlessConfig('easy'), seed);
      const seen: string[] = [];
      for (let turn = 0; turn < 30 && s.status === 'playing'; turn++) {
        seen.push(s.hand.map((h) => (h ? `${h.shapeId}:${h.color}` : '-')).join(','));
        const move = firstLegalMove(s);
        if (!move) break;
        s = apply(s, move).state;
      }
      return { seen, s };
    };
    const a = play(1234);
    const b = play(1234);
    expect(a.seen).toEqual(b.seen);
    expect(a.s).toEqual(b.s);
    expect(play(999).seen).not.toEqual(a.seen);
  });
});

describe('piece catalog', () => {
  it('has the expected orientations per category', () => {
    const count = (cat: string) => PIECES.filter((p) => p.category === cat).length;
    expect(count('single')).toBe(1);
    expect(count('line2')).toBe(2);
    expect(count('line5')).toBe(2);
    expect(count('square2')).toBe(1);
    expect(count('square3')).toBe(1);
    expect(count('rect')).toBe(2);
    expect(count('smallL')).toBe(4);
    expect(count('L')).toBe(8);
    expect(count('bigL')).toBe(4);
    expect(count('T')).toBe(4);
    expect(count('SZ')).toBe(4);
  });

  it('has unique ids and normalised cells', () => {
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(PIECES.length);
    for (const p of PIECES) {
      expect(Math.min(...p.cells.map((c) => c.row))).toBe(0);
      expect(Math.min(...p.cells.map((c) => c.col))).toBe(0);
    }
  });
});

describe('placement validity', () => {
  const state = makeState({
    board: ['#.......', ...EMPTY8.slice(1)],
    hand: ['O2-0', 'I5-0', null],
  });

  it('rejects overlap, out of bounds and empty slots', () => {
    expect(apply(state, { type: 'place', handIndex: 0, row: 0, col: 0 }).events[0].type).toBe(
      'invalidAction',
    );
    expect(apply(state, { type: 'place', handIndex: 1, row: 0, col: 4 }).events[0].type).toBe(
      'invalidAction',
    );
    expect(apply(state, { type: 'place', handIndex: 0, row: -1, col: 3 }).events[0].type).toBe(
      'invalidAction',
    );
    expect(apply(state, { type: 'place', handIndex: 2, row: 3, col: 3 }).events[0].type).toBe(
      'invalidAction',
    );
  });

  it('accepts a valid placement without mutating the input', () => {
    const before = JSON.stringify(state);
    const { state: next, events } = apply(state, { type: 'place', handIndex: 1, row: 0, col: 3 });
    expect(events[0].type).toBe('piecePlaced');
    expect(JSON.stringify(state)).toBe(before);
    expect(next.board.cells.slice(3, 8).every((c) => c?.color === 'blue')).toBe(true);
    expect(next.hand[1]).toBeNull();
    expect(next.placements).toBe(1);
  });

  it('canPlace respects edges exactly', () => {
    const i5 = getShape('I5-0');
    expect(canPlace(state.board, i5, 7, 3)).toBe(true);
    expect(canPlace(state.board, i5, 7, 4)).toBe(false);
  });
});

describe('line clearing', () => {
  it('clears a single row', () => {
    const s = makeState({
      board: ['rrrrr...', ...EMPTY8.slice(1)],
      hand: ['I3-0', 'dot-0', 'dot-0'],
    });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 5 });
    const cleared = events.find((e) => e.type === 'linesCleared');
    expect(cleared).toMatchObject({ rows: [0], cols: [], lines: 1 });
    expect(state.board.cells.every((c) => c === null)).toBe(true);
  });

  it('clears a row and a column simultaneously, counting the shared cell once', () => {
    // Row 0 missing (0,0); column 0 missing (0,0). Dropping a dot at (0,0) completes both.
    const board = ['.rrrrrrr', ...Array.from({ length: 7 }, () => 'g.......')];
    const s = makeState({ board, hand: ['dot-0', 'dot-0', 'dot-0'] });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 0 });
    const cleared = events.find((e) => e.type === 'linesCleared');
    if (cleared?.type !== 'linesCleared') throw new Error('expected clear');
    expect(cleared.rows).toEqual([0]);
    expect(cleared.cols).toEqual([0]);
    expect(cleared.lines).toBe(2);
    expect(cleared.cells).toHaveLength(15); // 8 + 8 - 1 shared
    expect(state.stats.blocksBlasted).toBe(15);
    expect(state.board.cells.every((c) => c === null)).toBe(true);
  });

  it('findFullLines and clearLines work on raw boards', () => {
    const s = makeState({ board: ['rrrrrrrr', 'rrrrrrrr', ...EMPTY8.slice(2)], hand: [] });
    expect(findFullLines(s.board)).toEqual({ rows: [0, 1], cols: [] });
    expect(clearLines(s.board, [0, 1], []).cleared).toHaveLength(16);
  });

  it('obstacles are cleared like normal blocks', () => {
    const s = makeState({
      board: ['##rr###.', ...EMPTY8.slice(1)],
      hand: ['dot-0', 'dot-0', null],
    });
    const { state } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(state.board.cells.slice(0, 8).every((c) => c === null)).toBe(true);
  });
});

describe('scoring and combos', () => {
  const cfg = DIFFICULTIES.normal.scoring;

  it('scales line points with simultaneous lines and combo', () => {
    expect(clearPoints(cfg, 1, 1)).toBe(10);
    expect(clearPoints(cfg, 2, 1)).toBe(30);
    expect(clearPoints(cfg, 3, 1)).toBe(60);
    expect(comboMultiplier(cfg, 3)).toBe(2);
    expect(clearPoints(cfg, 1, 3)).toBe(20);
  });

  it('awards points per placed cell', () => {
    const s = makeState({ board: EMPTY8, hand: ['O3-0', 'dot-0', 'dot-0'] });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 2, col: 2 });
    expect(state.score).toBe(9);
    expect(events).toContainEqual({ type: 'scoreChanged', score: 9, delta: 9 });
  });

  it('builds a combo on consecutive clears and resets on a miss', () => {
    const s = makeState({
      board: ['rrrrrrr.', 'rrrrrrr.', ...EMPTY8.slice(2, 7), 'g.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
    });
    let r = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(r.state.combo).toBe(1);
    expect(r.state.score).toBe(1 + 10);
    r = apply(r.state, { type: 'place', handIndex: 1, row: 1, col: 7 });
    expect(r.state.combo).toBe(2);
    expect(r.events).toContainEqual({ type: 'comboChanged', combo: 2, previous: 1 });
    expect(r.state.score).toBe(11 + 1 + 15); // 10 * 1.5
    r = apply(r.state, { type: 'place', handIndex: 2, row: 5, col: 5 });
    expect(r.state.combo).toBe(0);
    expect(r.state.stats.maxCombo).toBe(2);
    expect(r.events).toContainEqual({ type: 'comboChanged', combo: 0, previous: 2 });
  });

  it('gives an all-clear bonus', () => {
    const s = makeState({
      board: ['rrrrrrr.', ...EMPTY8.slice(1)],
      hand: ['dot-0', 'dot-0', null],
    });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(events.some((e) => e.type === 'boardCleared')).toBe(true);
    expect(state.score).toBe(1 + 10 + cfg.allClearBonus);
  });
});

describe('dealing and game over', () => {
  it('deals a new hand once all pieces are placed', () => {
    const s = makeState({ board: EMPTY8, hand: ['dot-0', null, null] });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 4, col: 4 });
    expect(events.some((e) => e.type === 'handDealt')).toBe(true);
    expect(state.hand.every((h) => h !== null)).toBe(true);
    expect(state.hand[0]!.id).toBeGreaterThan(0);
  });

  it('ends the game when no remaining piece fits', () => {
    // Checkerboard-ish: only isolated single holes remain after placing.
    const board = [
      'r.rrrrrr',
      'rrrrrrr.',
      'rr.rrrrr',
      'rrrrr.rr',
      '.rrrrrrr',
      'rrr.rrrr',
      'rrrrrr.r',
      'rrrr.rr.',
    ];
    const s = makeState({ board, hand: ['dot-0', 'O2-0', 'I2-0'] });
    expect(handFits(s)).toEqual([true, false, false]);
    // Fill (7,7): column 7 still has a hole at (1,7), row 7 has a hole at (7,4).
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 7, col: 7 });
    expect(state.status).toBe('lost');
    expect(state.endReason).toBe('noFit');
    expect(events.at(-1)).toEqual({ type: 'gameOver', reason: 'noFit' });
    // No further actions are accepted.
    expect(apply(state, { type: 'place', handIndex: 1, row: 0, col: 1 }).events[0].type).toBe(
      'invalidAction',
    );
  });

  it('keeps playing while at least one piece fits', () => {
    const s = makeState({ board: EMPTY8, hand: ['O3-0', 'O3-0', 'O3-0'] });
    expect(handFits(s)).toEqual([true, true, true]);
  });

  it('easy guarantees at least one fitting piece per hand', () => {
    const cfg = DIFFICULTIES.easy.generator;
    // Board where only 1x1 / 2-lines can fit.
    const s = makeState({
      board: Array.from({ length: 8 }, (_, r) => (r % 2 === 0 ? 'r.r.r.r.' : 'rrrrrrrr')),
      hand: [],
    });
    for (let seed = 1; seed < 200; seed++) {
      const { hand } = dealHand(new Rng(seed), s.board, cfg, ['red'], 1);
      const fits = hand.some((h) =>
        PIECES.some(
          (p) =>
            p.id === h.shapeId &&
            Array.from({ length: 8 }, (_, r) => r).some((r) =>
              Array.from({ length: 8 }, (_, c) => c).some((c) => canPlace(s.board, p, r, c)),
            ),
        ),
      );
      expect(fits).toBe(true);
    }
  });
});

describe('placement preview', () => {
  it('reports validity and lines that would clear', () => {
    const s = makeState({
      board: ['rrrrr...', ...EMPTY8.slice(1)],
      hand: ['I3-0', null, null],
    });
    expect(previewPlacement(s, 0, 0, 5)).toMatchObject({ valid: true, rows: [0], cols: [] });
    expect(previewPlacement(s, 0, 0, 4).valid).toBe(false);
    expect(previewPlacement(s, 0, 3, 0)).toMatchObject({ valid: true, rows: [], cols: [] });
  });
});

describe('serialization', () => {
  it('a JSON round-tripped state continues identically', () => {
    let s = createGame(endlessConfig('normal'), 77);
    for (let i = 0; i < 5; i++) s = apply(s, firstLegalMove(s)!).state;
    const copy = JSON.parse(JSON.stringify(s));
    const move = firstLegalMove(s)!;
    expect(apply(copy, move)).toEqual(apply(s, move));
  });
});

/** Scan for the first legal move (test helper, deterministic). */
function firstLegalMove(s: ReturnType<typeof createGame>) {
  for (let h = 0; h < s.hand.length; h++) {
    for (let r = 0; r < s.board.height; r++) {
      for (let c = 0; c < s.board.width; c++) {
        if (previewPlacement(s, h, r, c).valid)
          return { type: 'place' as const, handIndex: h, row: r, col: c };
      }
    }
  }
  return null;
}
