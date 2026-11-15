/**
 * Versus (two-player) presets — edit to tune Garbage Attack.
 * Junk cells sent: garbageByLines[linesClearedAtOnce] + comboBonus × (combo − 1),
 * capped at maxPerAttack. A single line sends nothing, so attacks come from
 * multi-clears and combos.
 */
import type { GameConfig, VersusConfig } from '../engine';
import { endlessConfig } from './difficulties';

export const GARBAGE_ATTACK: VersusConfig = {
  garbageByLines: [0, 0, 2, 4, 6, 8, 10],
  comboBonus: 1,
  maxPerAttack: 10,
};

/** Both players use this config with the same seed, so they get the same pieces. */
export function garbageAttackConfig(): GameConfig {
  return { ...endlessConfig('normal'), versus: GARBAGE_ATTACK };
}
