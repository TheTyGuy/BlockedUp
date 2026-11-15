/** Local persistence (settings, best scores, level progress, in-progress Endless games). */
import type { GameState } from '../engine';
import type { DifficultyId } from '../data/difficulties';

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
  v: 1;
  settings: Settings;
  best: Partial<Record<DifficultyId, number>>;
  levels: Record<string, LevelProgress>;
  /** Unfinished Endless games, so closing the tab doesn't lose a run. */
  endless: Partial<Record<DifficultyId, GameState>>;
}

const KEY = 'blockedup:v1';

const defaults = (): SaveData => ({
  v: 1,
  settings: { sound: true, haptics: true, patterns: true },
  best: {},
  levels: {},
  endless: {},
});

let data: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const d = defaults();
    return {
      ...d,
      ...parsed,
      settings: { ...d.settings, ...parsed.settings },
      best: { ...parsed.best },
      levels: { ...parsed.levels },
      endless: { ...parsed.endless },
    };
  } catch {
    return defaults();
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or disabled (private mode) — the game still works, just without saving.
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
  totalStars(): number {
    return Object.values(data.levels).reduce((n, l) => n + l.stars, 0);
  },

  savedEndless(d: DifficultyId): GameState | undefined {
    const s = data.endless[d];
    return s && s.version === 1 && s.status === 'playing' ? s : undefined;
  },
  saveEndless(d: DifficultyId, state: GameState | undefined): void {
    if (state && state.status === 'playing') data.endless[d] = state;
    else delete data.endless[d];
    save();
  },

  resetProgress(): void {
    data = { ...defaults(), settings: data.settings };
    save();
  },
};
