import { describe, expect, it } from 'vitest';
import {
  apply,
  computeStars,
  createGame,
  type GameState,
  type GoalSpec,
  type MissionConfig,
} from '../src/engine';
import { LEVELS, levelConfig } from '../src/data/levels';
import { makeState } from './helpers';

const EMPTY8 = Array(8).fill('........');

function mission(goals: GoalSpec[], extra: Partial<MissionConfig> = {}) {
  return { mission: { goals, ...extra } };
}

function place(s: GameState, handIndex: number, row: number, col: number) {
  const r = apply(s, { type: 'place', handIndex, row, col });
  expect(r.events[0].type).not.toBe('invalidAction');
  return r;
}

describe('mission goal types', () => {
  // Row 0 and column 7 both need just (0,7): one dot clears a row AND a column.
  const crossBoard = ['rrrrrrr.', ...Array.from({ length: 7 }, () => '.......b')];

  it('clearRows / clearCols / clearLines count separately', () => {
    const s = makeState({
      board: crossBoard,
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([
        { type: 'clearRows', target: 1 },
        { type: 'clearCols', target: 2 },
        { type: 'clearLines', target: 2 },
      ]),
    });
    const { state, events } = place(s, 0, 0, 7);
    expect(state.mission!.goals.map((g) => g.progress)).toEqual([1, 1, 2]);
    expect(events.filter((e) => e.type === 'goalProgress')).toHaveLength(3);
    expect(state.status).toBe('playing'); // clearCols 1/2 not done yet
  });

  it('blastColor counts only matching blocks, once per cell', () => {
    const s = makeState({
      board: ['rrrbbbr.', ...EMPTY8.slice(1)],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      colors: ['red', 'red', 'red'],
      config: mission([{ type: 'blastColor', color: 'red', target: 10 }]),
    });
    const { state } = place(s, 0, 0, 7);
    expect(state.mission!.goals[0].progress).toBe(5); // 4 pre-filled red + placed red dot
  });

  it('score goal tracks score and completes', () => {
    const s = makeState({
      board: EMPTY8,
      hand: ['O3-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'score', target: 9 }]),
    });
    const { state, events } = place(s, 0, 0, 0);
    expect(state.mission!.goals[0].progress).toBe(9);
    expect(state.status).toBe('won');
    expect(events.at(-1)).toMatchObject({ type: 'gameWon' });
  });

  it('combo goal tracks the best streak', () => {
    const s = makeState({
      board: ['rrrrrrr.', 'rrrrrrr.', ...EMPTY8.slice(2, 7), 'g.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'combo', target: 2 }]),
    });
    let r = place(s, 0, 0, 7);
    expect(r.state.mission!.goals[0].progress).toBe(1);
    r = place(r.state, 1, 1, 7);
    expect(r.state.mission!.goals[0].progress).toBe(2);
    expect(r.state.status).toBe('won');
  });

  it('multiClear needs N lines from one placement', () => {
    const s = makeState({
      board: ['rrrrrrr.', 'rrrrrrr.', ...EMPTY8.slice(2, 7), 'g.......'],
      hand: ['I2-1', 'dot-0', 'dot-0'], // I2-1 = vertical domino
      config: mission([{ type: 'multiClear', target: 2 }]),
    });
    const { state } = place(s, 0, 0, 7);
    expect(state.mission!.goals[0].progress).toBe(2);
    expect(state.status).toBe('won');
  });

  it('clearObstacles targets the obstacles present at start', () => {
    const s = makeState({
      board: ['##rrrrr.', ...EMPTY8.slice(1, 7), '#.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'clearObstacles' }]),
    });
    expect(s.mission!.goals[0].target).toBe(3);
    const { state } = place(s, 0, 0, 7);
    expect(state.mission!.goals[0].progress).toBe(2);
    expect(state.status).toBe('playing');
  });

  it('clearObstacles target is computed by createGame from level layout', () => {
    const lvl = LEVELS.find((l) => l.id === 'l05')!;
    const s = createGame(levelConfig(lvl), 1);
    expect(s.mission!.goals[0].target).toBe(6);
  });

  it('survive counts placements', () => {
    const s = makeState({
      board: EMPTY8,
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'survive', target: 2 }]),
    });
    let r = place(s, 0, 0, 0);
    expect(r.state.status).toBe('playing');
    r = place(r.state, 1, 5, 5);
    expect(r.state.status).toBe('won');
  });
});

describe('mission win / lose', () => {
  it('loses when the move limit runs out', () => {
    const s = makeState({
      board: EMPTY8,
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'clearLines', target: 1 }], { moveLimit: 2 }),
    });
    let r = place(s, 0, 0, 0);
    expect(r.state.status).toBe('playing');
    r = place(r.state, 1, 3, 3);
    expect(r.state.status).toBe('lost');
    expect(r.state.endReason).toBe('outOfMoves');
    expect(r.events.at(-1)).toEqual({ type: 'gameOver', reason: 'outOfMoves' });
  });

  it('a win on the last allowed move counts as a win', () => {
    const s = makeState({
      board: ['rrrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([{ type: 'clearLines', target: 1 }], { moveLimit: 1 }),
    });
    expect(place(s, 0, 0, 7).state.status).toBe('won');
  });

  it('requires ALL goals', () => {
    const s = makeState({
      board: ['rrrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      hand: ['dot-0', 'dot-0', 'dot-0'],
      config: mission([
        { type: 'clearLines', target: 1 },
        { type: 'score', target: 1000 },
      ]),
    });
    expect(place(s, 0, 0, 7).state.status).toBe('playing');
  });
});

describe('star rating', () => {
  const cfg: MissionConfig = {
    goals: [],
    stars: { two: { maxMoves: 10 }, three: { maxMoves: 5, minScore: 500 } },
  };
  const at = (placements: number, score: number) => ({ placements, score }) as GameState;

  it('gives 1–3 stars with OR-ed criteria', () => {
    expect(computeStars(cfg, at(20, 0))).toBe(1);
    expect(computeStars(cfg, at(8, 0))).toBe(2);
    expect(computeStars(cfg, at(5, 0))).toBe(3);
    expect(computeStars(cfg, at(9, 600))).toBe(3);
    expect(computeStars(cfg, at(20, 600))).toBe(1); // 3 stars requires the 2-star criterion
  });
});

describe('level data', () => {
  it('has ~20 levels with unique ids that all build a playable game', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const level of LEVELS) {
      const s = createGame(levelConfig(level), 1);
      expect(s.status, level.id).toBe('playing');
      expect(s.board.width).toBe(level.size);
      for (const g of s.mission!.goals) expect(g.target, level.id).toBeGreaterThan(0);
      for (const g of level.goals) {
        if (g.type === 'blastColor') {
          const prefilled = (level.layout ?? []).join('').includes(g.color[0]);
          expect(level.colors.includes(g.color) || prefilled, `${level.id} ${g.color}`).toBe(true);
        }
      }
    }
  });

  it('board sizes both grow and shrink across the campaign', () => {
    const sizes = LEVELS.map((l) => l.size);
    const ups = sizes.slice(1).filter((s, i) => s > sizes[i]).length;
    const downs = sizes.slice(1).filter((s, i) => s < sizes[i]).length;
    expect(ups).toBeGreaterThan(2);
    expect(downs).toBeGreaterThan(2);
  });
});
