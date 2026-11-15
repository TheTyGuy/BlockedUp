/**
 * Piece generator: deals hands using category weights from the difficulty
 * config and the seeded RNG. Deterministic for a given RNG state + board.
 */
import { fitsAnywhere } from './board';
import { PIECES, type PieceShape } from './pieces';
import type { Rng } from './rng';
import type { Board, ColorId, GeneratorConfig, HandPiece, PieceCategory } from './types';

/** Per-piece weights: each category's weight is split across its orientations. */
export function pieceWeights(config: GeneratorConfig, pieces = PIECES): number[] {
  const counts = new Map<PieceCategory, number>();
  for (const p of pieces) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return pieces.map(
    (p) => (config.categoryWeights[p.category] ?? 0) / (counts.get(p.category) ?? 1),
  );
}

export interface DealResult {
  hand: HandPiece[];
  nextPieceId: number;
}

/**
 * Deal a fresh hand. With probability `guaranteeFitChance`, ensure at least
 * one piece fits the current board (if any piece in the weighted set can).
 */
export function dealHand(
  rng: Rng,
  board: Board,
  config: GeneratorConfig,
  palette: readonly ColorId[],
  nextPieceId: number,
): DealResult {
  const weights = pieceWeights(config);
  const shapes: PieceShape[] = [];
  for (let i = 0; i < config.handSize; i++) {
    shapes.push(PIECES[Math.max(0, rng.weightedIndex(weights))]);
  }

  // Always draw this number so the RNG stream doesn't depend on the outcome
  // of the fit check (keeps sequences easier to reason about).
  const guaranteeRoll = rng.float();
  if (guaranteeRoll < config.guaranteeFitChance && !shapes.some((s) => fitsAnywhere(board, s))) {
    const fitWeights = PIECES.map((p, i) => (fitsAnywhere(board, p) ? weights[i] : 0));
    let pick = rng.weightedIndex(fitWeights);
    if (pick < 0) {
      // Nothing in the weighted set fits; fall back to any fitting piece at all.
      pick = rng.weightedIndex(PIECES.map((p) => (fitsAnywhere(board, p) ? 1 : 0)));
    }
    if (pick >= 0) shapes[rng.int(shapes.length)] = PIECES[pick];
  }

  const hand = shapes.map((shape, i) => ({
    id: nextPieceId + i,
    shapeId: shape.id,
    color: palette[rng.int(palette.length)],
  }));
  return { hand, nextPieceId: nextPieceId + hand.length };
}
