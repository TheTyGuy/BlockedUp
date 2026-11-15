/**
 * Versus rules (Phase 2, Garbage Attack). Pure and deterministic like the rest
 * of the engine.
 */
import { idx } from './board';
import type { Rng } from './rng';
import type { Board, Point, VersusConfig } from './types';

/** Junk cells sent to the opponent for clearing `lines` at once on a `combo` streak. */
export function garbageFor(cfg: VersusConfig, lines: number, combo: number): number {
  if (lines <= 0) return 0;
  const table = cfg.garbageByLines;
  const base = table[Math.min(lines, table.length - 1)] ?? 0;
  const bonus = cfg.comboBonus * Math.max(0, combo - 1);
  return Math.max(0, Math.min(cfg.maxPerAttack, base + bonus));
}

/**
 * Drop up to `count` stone blocks into random empty cells.
 *
 * Junk never completes a row or column (it only lands where its row and its
 * column each keep at least one other empty cell), so receiving garbage can't
 * hand the victim a free line clear. Returns the cells used; fewer than
 * `count` if the board runs out of eligible spots.
 */
export function dropJunk(board: Board, count: number, rng: Rng): { board: Board; cells: Point[] } {
  const cells = board.cells.slice();
  const rowEmpty = new Array<number>(board.height).fill(0);
  const colEmpty = new Array<number>(board.width).fill(0);
  for (let r = 0; r < board.height; r++) {
    for (let c = 0; c < board.width; c++) {
      if (cells[r * board.width + c] === null) {
        rowEmpty[r]++;
        colEmpty[c]++;
      }
    }
  }

  const placed: Point[] = [];
  for (let n = 0; n < count; n++) {
    const eligible: Point[] = [];
    for (let r = 0; r < board.height; r++) {
      if (rowEmpty[r] < 2) continue;
      for (let c = 0; c < board.width; c++) {
        if (colEmpty[c] >= 2 && cells[r * board.width + c] === null)
          eligible.push({ row: r, col: c });
      }
    }
    if (eligible.length === 0) break;
    const p = eligible[rng.int(eligible.length)];
    cells[idx(board, p.row, p.col)] = { kind: 'obstacle', color: null };
    rowEmpty[p.row]--;
    colEmpty[p.col]--;
    placed.push(p);
  }
  return { board: { ...board, cells }, cells: placed };
}
