/**
 * Save-file format, migrations and validation. Pure functions (no
 * localStorage) so they can be unit-tested.
 *
 * PLAYER PROGRESS RULES — read before changing anything here:
 *  - Never change STORAGE_KEY. Progress lives in each player's browser under
 *    this key; a new key means everyone starts from zero.
 *  - To change the shape of SaveData, bump SAVE_VERSION and add a migration
 *    to MIGRATIONS that upgrades the previous version. Never drop fields that
 *    hold progress (best scores, level stars).
 *  - Level stars are keyed by level `id` (see data/levels.ts), so ids must
 *    never be renamed or removed. tests/progress.test.ts enforces this.
 */
import { COLOR_IDS, PIECES, type GameState } from '../engine';
import { DIFFICULTY_ORDER, type DifficultyId } from '../data/difficulties';

export const STORAGE_KEY = 'blockedup:v1';
export const SAVE_VERSION = 1;

export interface Settings {
  sound: boolean;
  haptics: boolean;
  patterns: boolean;
}

export interface LevelProgress {
  stars: number;
  bestScore: number;
}

export interface SaveData {
  v: number;
  settings: Settings;
  best: Partial<Record<DifficultyId, number>>;
  levels: Record<string, LevelProgress>;
  /** Unfinished Endless games, so closing the tab doesn't lose a run. */
  endless: Partial<Record<DifficultyId, GameState>>;
}

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  settings: { sound: true, haptics: true, patterns: true },
  best: {},
  levels: {},
  endless: {},
});

type RawSave = Record<string, unknown>;

/**
 * Upgrade steps: MIGRATIONS[n] turns a version-n save into version n+1.
 * Example for a future v2:
 *   1: (s) => ({ ...s, v: 2, achievements: {} }),
 */
const MIGRATIONS: Record<number, (s: RawSave) => RawSave> = {};

const isObject = (x: unknown): x is RawSave =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isScore = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/**
 * Turn whatever is in storage into valid SaveData. Never throws. Bad or
 * unexpected entries are dropped one by one, so a single corrupt value can't
 * wipe the rest of a player's progress.
 */
export function parseSave(raw: string | null): SaveData {
  const d = defaultSave();
  if (!raw) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!isObject(parsed)) return d;

  let s: RawSave = parsed;
  let v = typeof s.v === 'number' ? s.v : 1;
  while (v < SAVE_VERSION && MIGRATIONS[v]) {
    s = MIGRATIONS[v](s);
    v++;
  }

  const out = defaultSave();
  if (isObject(s.settings)) {
    for (const k of Object.keys(out.settings) as (keyof Settings)[]) {
      if (typeof s.settings[k] === 'boolean') out.settings[k] = s.settings[k] as boolean;
    }
  }
  if (isObject(s.best)) {
    for (const id of DIFFICULTY_ORDER) {
      if (isScore(s.best[id])) out.best[id] = s.best[id] as number;
    }
  }
  if (isObject(s.levels)) {
    // Keep every level id, even unknown ones (e.g. from a newer build, or a
    // level that's temporarily removed), so the progress is never thrown away.
    for (const [id, p] of Object.entries(s.levels)) {
      if (isObject(p) && isScore(p.stars)) {
        out.levels[id] = {
          stars: Math.min(3, Math.floor(p.stars)),
          bestScore: isScore(p.bestScore) ? p.bestScore : 0,
        };
      }
    }
  }
  if (isObject(s.endless)) {
    for (const id of DIFFICULTY_ORDER) {
      const g = s.endless[id];
      if (isResumableGame(g)) out.endless[id] = g;
    }
  }
  return out;
}

const SHAPE_IDS = new Set(PIECES.map((p) => p.id));
const COLORS = new Set<string>(COLOR_IDS);

/**
 * Can this saved, unfinished Endless run be resumed by the current build?
 * If an update changed the engine in an incompatible way, only that one run
 * is dropped. Best scores and stars are stored separately and kept.
 */
export function isResumableGame(g: unknown): g is GameState {
  if (!isObject(g)) return false;
  const s = g as unknown as GameState;
  if (s.version !== 1 || s.status !== 'playing') return false;
  if (!isObject(s.board) || !Array.isArray(s.board.cells)) return false;
  if (s.board.cells.length !== s.board.width * s.board.height) return false;
  if (!Array.isArray(s.hand) || !isObject(s.config) || !isObject(s.stats)) return false;
  for (const h of s.hand) {
    if (h === null) continue;
    if (!isObject(h) || !SHAPE_IDS.has(h.shapeId) || !COLORS.has(h.color)) return false;
  }
  for (const c of s.board.cells) {
    if (c === null) continue;
    if (!isObject(c) || (c.kind !== 'block' && c.kind !== 'obstacle')) return false;
  }
  return typeof s.score === 'number' && typeof s.rng === 'number';
}
