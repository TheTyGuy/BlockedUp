/** Scoring rules. All tunable numbers live in ScoringConfig. */
import type { ScoringConfig } from './types';

export function placementPoints(cfg: ScoringConfig, cells: number): number {
  return cfg.pointsPerCell * cells;
}

/** Combo multiplier for a combo streak (combo 1 = first clear = x1). */
export function comboMultiplier(cfg: ScoringConfig, combo: number): number {
  return 1 + cfg.comboStep * Math.max(0, combo - 1);
}

/** Points for clearing `lines` lines at once while on a `combo` streak. */
export function clearPoints(cfg: ScoringConfig, lines: number, combo: number): number {
  if (lines <= 0) return 0;
  const base = (cfg.lineBase * lines * (lines + 1)) / 2;
  return Math.round(base * comboMultiplier(cfg, combo));
}
