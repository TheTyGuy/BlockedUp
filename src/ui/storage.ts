/**
 * Local persistence (settings, best scores, level progress, in-progress
 * Endless games). The format, migrations and progress-safety rules are in
 * saveFormat.ts.
 */
import type { GameState } from '../engine';
import type { DifficultyId } from '../data/difficulties';
import { LEVELS } from '../data/levels';
import {
  STORAGE_KEY,
  defaultSave,
  isResumableGame,
  parseSave,
  type LevelProgress,
  type SaveData,
  type Settings,
} from './saveFormat';

export type { LevelProgress, Settings } from './saveFormat';

let data: SaveData = load();

function load(): SaveData {
  try {
    return parseSave(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (some private modes): play without saving.
    return defaultSave();
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or disabled (private mode) — the game still works, just without saving.
  }
}

// Keep in sync if the game is open in two tabs: pick up the other tab's saves.
try {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) data = parseSave(e.newValue);
  });
} catch {
  // not in a browser (tests)
}

/**
 * Ask the browser not to clear our storage under pressure (and, on iOS, not to
 * expire it after 7 days without a visit). Installed home-screen apps are
 * already exempt; this helps people who play in a browser tab.
 */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // unsupported
  }
}

export const store = {
  get settings(): Settings {
    return data.settings;
  },
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    data.settings = { ...data.settings, [key]: value };
    save();
  },

  best(d: DifficultyId): number {
    return data.best[d] ?? 0;
  },
  /** Returns true if this is a new best. */
  submitScore(d: DifficultyId, score: number): boolean {
    if (score <= this.best(d)) return false;
    data.best[d] = score;
    save();
    return true;
  },

  level(id: string): LevelProgress | undefined {
    return data.levels[id];
  },
  submitLevel(id: string, stars: number, score: number): void {
    const prev = data.levels[id];
    data.levels[id] = {
      stars: Math.max(stars, prev?.stars ?? 0),
      bestScore: Math.max(score, prev?.bestScore ?? 0),
    };
    save();
  },
  /** Stars across the levels in the current campaign. */
  totalStars(): number {
    return LEVELS.reduce((n, l) => n + (data.levels[l.id]?.stars ?? 0), 0);
  },

  savedEndless(d: DifficultyId): GameState | undefined {
    const s = data.endless[d];
    return isResumableGame(s) ? s : undefined;
  },
  saveEndless(d: DifficultyId, state: GameState | undefined): void {
    if (state && state.status === 'playing') data.endless[d] = state;
    else delete data.endless[d];
    save();
  },

  resetProgress(): void {
    data = { ...defaultSave(), settings: data.settings };
    save();
  },
};
