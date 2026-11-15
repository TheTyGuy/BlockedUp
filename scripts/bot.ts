/**
 * A simple greedy bot used to sanity-check level difficulty. It is not part
 * of the shipped game; it only uses the public engine API.
 */
import { apply, previewPlacement, type Action, type Board, type GameState } from '../src/engine';

function boardQuality(b: Board): number {
  let isolated = 0;
  let edges = 0;
  const empty = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < b.height && c < b.width && b.cells[r * b.width + c] === null;
  for (let r = 0; r < b.height; r++) {
    for (let c = 0; c < b.width; c++) {
      const e = empty(r, c);
      const right = c + 1 < b.width ? empty(r, c + 1) : false;
      const down = r + 1 < b.height ? empty(r + 1, c) : false;
      if (c + 1 < b.width && e !== right) edges++;
      if (r + 1 < b.height && e !== down) edges++;
      if (e && !empty(r - 1, c) && !empty(r + 1, c) && !empty(r, c - 1) && !empty(r, c + 1))
        isolated++;
    }
  }
  return -isolated * 6 - edges;
}

export function bestMove(s: GameState): Action | null {
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (let h = 0; h < s.hand.length; h++) {
    if (!s.hand[h]) continue;
    for (let r = 0; r < s.board.height; r++) {
      for (let c = 0; c < s.board.width; c++) {
        const p = previewPlacement(s, h, r, c);
        if (!p.valid) continue;
        const action: Action = { type: 'place', handIndex: h, row: r, col: c };
        const next = apply(s, action).state;
        let score = (p.rows.length + p.cols.length) * 40 + boardQuality(next.board);
        if (next.status === 'won') score += 1e6;
        if (next.status === 'lost') score -= 1e5;
        if (score > bestScore) {
          bestScore = score;
          best = action;
        }
      }
    }
  }
  return best;
}

export function playOut(s: GameState, maxMoves = 500): GameState {
  for (let i = 0; i < maxMoves && s.status === 'playing'; i++) {
    const move = bestMove(s);
    if (!move) break;
    s = apply(s, move).state;
  }
  return s;
}
