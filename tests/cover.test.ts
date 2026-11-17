import { describe, expect, it } from 'vitest';
import { apply, createGame, type GameConfig } from '../src/engine';
import { LEVELS, levelConfig, parseCover } from '../src/data/levels';
import { PHOTOS } from '../src/data/photos';
import { makeState } from './helpers';
import { existsSync } from 'node:fs';

const EMPTY8 = Array(8).fill('........');
const coverAll = (n: number) => new Array<number>(64).fill(n);
const reveal: Partial<GameConfig> = { mission: { goals: [{ type: 'reveal' }] } };

/** A state whose board is custom but whose cover comes from `cover`. */
function withCover(board: string[], hand: (string | null)[], cover: number[]) {
  const s = makeState({ board, hand, config: { ...reveal, cover } });
  const fresh = createGame({ ...s.config, initialCells: [] }, 1);
  return { ...s, cover: fresh.cover, mission: fresh.mission };
}

describe('cover tiles', () => {
  it('a line clear damages the cover under every cell of that line', () => {
    const s = withCover(
      ['rrrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      ['dot-0', 'dot-0', 'dot-0'],
      coverAll(2),
    );
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    const e = events.find((x) => x.type === 'coverDamaged');
    if (e?.type !== 'coverDamaged') throw new Error('expected coverDamaged');
    expect(e.cells).toHaveLength(8);
    expect(e.cells.every((c) => c.row === 0 && c.layers === 1)).toBe(true);
    expect(state.cover!.slice(0, 8)).toEqual(Array(8).fill(1));
    expect(state.cover!.slice(8).every((n) => n === 2)).toBe(true);
    expect(s.cover!.every((n) => n === 2)).toBe(true); // input not mutated
  });

  it('a cell where a cleared row and column cross is only hit once', () => {
    const board = ['.rrrrrrr', ...Array.from({ length: 7 }, () => 'g.......')];
    const s = withCover(board, ['dot-0', 'dot-0', 'dot-0'], coverAll(2));
    const { state } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 0 });
    expect(state.cover![0]).toBe(1);
    expect(state.cover!.filter((n) => n === 1)).toHaveLength(15);
  });

  it('placing without clearing leaves the cover alone, and covers never block placement', () => {
    const s = withCover(EMPTY8, ['O3-0', 'dot-0', 'dot-0'], coverAll(2));
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 2, col: 2 });
    expect(events[0].type).toBe('piecePlaced');
    expect(events.some((e) => e.type === 'coverDamaged')).toBe(false);
    expect(state.cover).toBe(s.cover);
  });

  it('uncovered and already-broken cells are skipped', () => {
    const cover = coverAll(0);
    cover[0] = 1;
    const s = withCover(
      ['rrrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      ['dot-0', 'dot-0', 'dot-0'],
      cover,
    );
    const { events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    const e = events.find((x) => x.type === 'coverDamaged');
    expect(e).toMatchObject({ cells: [{ row: 0, col: 0, layers: 0 }] });
  });

  it('games without covers have no cover state or events', () => {
    const s = makeState({
      board: ['rrrrrrr.', ...EMPTY8.slice(1, 7), 'g.......'],
      hand: ['dot-0', null, null],
    });
    const { state, events } = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(state.cover).toBeUndefined();
    expect(events.some((e) => e.type === 'coverDamaged')).toBe(false);
  });
});

describe('reveal goal', () => {
  it('targets the covered cells and wins when the last tile breaks', () => {
    const cover = coverAll(0);
    for (let c = 0; c < 8; c++) cover[c] = c < 4 ? 2 : 1; // top row only
    const s = withCover(
      ['rrrrrrr.', 'rrrrrrr.', ...EMPTY8.slice(2, 7), 'g.......'],
      ['dot-0', 'I4-0', 'dot-0'],
      cover,
    );
    expect(s.mission!.goals[0].target).toBe(8);
    let r = apply(s, { type: 'place', handIndex: 0, row: 0, col: 7 });
    expect(r.state.mission!.goals[0].progress).toBe(4); // the four 1-layer tiles broke
    expect(r.state.status).toBe('playing');
    // Refill row 0 and clear it again to break the cracked tiles.
    r = apply(
      {
        ...r.state,
        board: {
          ...r.state.board,
          cells: s.board.cells.map((_c, i) =>
            i < 4
              ? null
              : i < 8
                ? { kind: 'block' as const, color: 'red' as const }
                : r.state.board.cells[i],
          ),
        },
      },
      { type: 'place', handIndex: 1, row: 0, col: 0 },
    );
    expect(r.state.mission!.goals[0].progress).toBe(8);
    expect(r.state.status).toBe('won');
  });
});

describe('photo level data', () => {
  it('every reveal level has a cover, a known photo and an image file', () => {
    const ids = new Set(PHOTOS.map((p) => p.id));
    const used: string[] = [];
    for (const level of LEVELS) {
      const wantsReveal = level.goals.some((g) => g.type === 'reveal');
      if (!wantsReveal) continue;
      expect(
        parseCover(level)!.some((n) => n > 0),
        level.id,
      ).toBe(true);
      expect(level.photo && ids.has(level.photo), `${level.id} photo`).toBe(true);
      expect(existsSync(`public/photos/${level.photo}.jpg`), `${level.photo}.jpg`).toBe(true);
      used.push(level.photo!);
      const s = createGame(levelConfig(level), 3);
      expect(s.cover).toHaveLength(level.size * level.size);
    }
    expect(new Set(used).size).toBe(used.length); // one photo per level
    for (const p of PHOTOS) expect(existsSync(`public/photos/${p.id}.jpg`), p.id).toBe(true);
  });

  it('rejects malformed covers', () => {
    const base = LEVELS.find((l) => l.id === 'l21')!;
    expect(() => parseCover({ ...base, cover: ['11'] })).toThrow();
    expect(() => parseCover({ ...base, cover: Array(8).fill('1111111x') })).toThrow();
  });
});
