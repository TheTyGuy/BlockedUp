/**
 * Versus rules (Phase 2, Garbage Attack). Pure and deterministic like the rest
 * of the engine.
 */
import type { Rng } from './rng';
import type { Board, ClearedCell, Point, VersusConfig } from './types';

/** Junk cells sent to the opponent for clearing `lines` at once on a `combo` streak. */
export function garbageFor(cfg: VersusConfig, lines: number, combo: number): number {
  if (lines <= 0) return 0;
  const table = cfg.garbageByLines;
  const base = table[Math.min(lines, table.length - 1)] ?? 0;
  const bonus = cfg.comboBonus * Math.max(0, combo - 1);
  return Math.max(0, Math.min(cfg.maxPerAttack, base + bonus));
}

export interface JunkResult {
  board: Board;
  /** Stones that landed in empty cells. */
  cells: Point[];
  /** Coloured blocks that were broken off and removed. */
  smashed: ClearedCell[];
}

/**
 * Apply `count` pieces of junk to a board. Each piece does one of two things:
 *
 *  - LAND: a stone block drops into a random empty cell. It never completes a
 *    row or column (it only lands where its row and its column each keep at
 *    least one other empty cell), so junk can't hand the victim a free clear.
 *  - SMASH (probability `smashChance`): a random coloured block is broken off
 *    and removed, punching a hole in whatever the victim was building.
 *    Stones are never smashed, so an attack can't clean up earlier junk.
 *
 * If the chosen effect is impossible (nothing to smash / nowhere to land) the
 * other one is used; if neither is possible the remaining junk is discarded.
 */
export function dropJunk(board: Board, count: number, rng: Rng, smashChance = 0): JunkResult {
  const cells = board.cells.slice();
  const w = board.width;
  const rowEmpty = new Array<number>(board.height).fill(0);
  const colEmpty = new Array<number>(w).fill(0);
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < w; c++) {
      if (cells[r * w + c] === null) {
        rowEmpty[r]++;
        colEmpty[c]++;
      }
    }
  }

  const landSpots = (): Point[] => {
    const out: Point[] = [];
    for (let r = 0; r < board.height; r++) {
      if (rowEmpty[r] < 2) continue;
      for (let c = 0; c < w; c++) {
        if (colEmpty[c] >= 2 && cells[r * w + c] === null) out.push({ row: r, col: c });
      }
    }
    return out;
  };
  const smashSpots = (): Point[] => {
    const out: Point[] = [];
    for (let r = 0; r < board.height; r++) {
      for (let c = 0; c < w; c++) {
        if (cells[r * w + c]?.kind === 'block') out.push({ row: r, col: c });
      }
    }
    return out;
  };

  const landed: Point[] = [];
  const smashed: ClearedCell[] = [];
  for (let n = 0; n < count; n++) {
    // Always draw the roll, so the RNG stream doesn't depend on the board.
    const wantSmash = rng.float() < smashChance;
    let spots = wantSmash ? smashSpots() : landSpots();
    let smash = wantSmash;
    if (spots.length === 0) {
      smash = !wantSmash;
      spots = smash ? smashSpots() : landSpots();
      if (spots.length === 0) break;
    }
    const p = spots[rng.int(spots.length)];
    const i = p.row * w + p.col;
    if (smash) {
      smashed.push({ row: p.row, col: p.col, cell: cells[i]! });
      cells[i] = null;
      rowEmpty[p.row]++;
      colEmpty[p.col]++;
    } else {
      cells[i] = { kind: 'obstacle', color: null };
      rowEmpty[p.row]--;
      colEmpty[p.col]--;
      landed.push(p);
    }
  }
  return { board: { ...board, cells }, cells: landed, smashed };
}
