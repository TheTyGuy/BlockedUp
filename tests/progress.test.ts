/**
 * Guards that keep players' saved progress safe across updates.
 * If one of these fails, an update would lose or corrupt someone's progress.
 */
import { describe, expect, it } from 'vitest';
import { apply, createGame, previewPlacement } from '../src/engine';
import { endlessConfig } from '../src/data/difficulties';
import { LEVELS } from '../src/data/levels';
import { STORAGE_KEY, defaultSave, isResumableGame, parseSave } from '../src/ui/saveFormat';

/**
 * Level ids that have shipped to players. Their stars are saved under these
 * ids, so they must never be renamed or removed. Append new ids here when you
 * add levels; never edit or delete existing entries.
 */
const SHIPPED_LEVEL_IDS = [
  'l01', 'l02', 'l03', 'l04', 'l05', 'l06', 'l07', 'l08', 'l09', 'l10',
  'l11', 'l12', 'l13', 'l14', 'l15', 'l16', 'l17', 'l18', 'l19', 'l20',
]; // prettier-ignore

describe('progress safety', () => {
  it('the storage key never changes', () => {
    expect(STORAGE_KEY).toBe('blockedup:v1');
  });

  it('every shipped level id still exists', () => {
    const ids = new Set(LEVELS.map((l) => l.id));
    for (const id of SHIPPED_LEVEL_IDS)
      expect(ids.has(id), `level "${id}" was renamed or removed`).toBe(true);
  });

  it('new levels are added to the shipped list', () => {
    const shipped = new Set(SHIPPED_LEVEL_IDS);
    const missing = LEVELS.map((l) => l.id).filter((id) => !shipped.has(id));
    expect(missing, 'add new level ids to SHIPPED_LEVEL_IDS').toEqual([]);
  });
});

describe('save parsing', () => {
  const v1Save = {
    v: 1,
    settings: { sound: false, haptics: true, patterns: false },
    best: { easy: 1200, normal: 640 },
    levels: { l01: { stars: 3, bestScore: 90 }, l02: { stars: 1, bestScore: 40 } },
    endless: {},
  };

  it('keeps everything from an existing save', () => {
    const s = parseSave(JSON.stringify(v1Save));
    expect(s.settings).toEqual(v1Save.settings);
    expect(s.best).toEqual(v1Save.best);
    expect(s.levels).toEqual(v1Save.levels);
  });

  it('keeps progress for level ids this build does not know', () => {
    const s = parseSave(JSON.stringify({ ...v1Save, levels: { l99: { stars: 2, bestScore: 5 } } }));
    expect(s.levels.l99).toEqual({ stars: 2, bestScore: 5 });
  });

  it('fills in settings added after the save was written', () => {
    const s = parseSave(JSON.stringify({ ...v1Save, settings: { sound: false } }));
    expect(s.settings).toEqual({ ...defaultSave().settings, sound: false });
  });

  it('drops only the corrupt entries, not the whole save', () => {
    const s = parseSave(
      JSON.stringify({
        ...v1Save,
        best: { easy: 'lots', normal: 640 },
        levels: { l01: { stars: 3, bestScore: 90 }, l02: 'oops' },
      }),
    );
    expect(s.best).toEqual({ normal: 640 });
    expect(s.levels).toEqual({ l01: { stars: 3, bestScore: 90 } });
  });

  it('returns defaults for missing or unreadable data without throwing', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{not json')).toEqual(defaultSave());
    expect(parseSave('[1,2,3]')).toEqual(defaultSave());
  });
});

describe('saved Endless runs', () => {
  const inProgress = () => {
    let s = createGame(endlessConfig('normal'), 5);
    for (let i = 0; i < 4; i++) {
      outer: for (let h = 0; h < s.hand.length; h++) {
        for (let r = 0; r < s.board.height; r++) {
          for (let c = 0; c < s.board.width; c++) {
            if (previewPlacement(s, h, r, c).valid) {
              s = apply(s, { type: 'place', handIndex: h, row: r, col: c }).state;
              break outer;
            }
          }
        }
      }
    }
    return JSON.parse(JSON.stringify(s));
  };

  it('a round-tripped run can be resumed', () => {
    const g = inProgress();
    expect(isResumableGame(g)).toBe(true);
    const s = parseSave(JSON.stringify({ v: 1, best: { normal: 50 }, endless: { normal: g } }));
    expect(s.endless.normal).toEqual(g);
  });

  it('an incompatible run is dropped but best scores are kept', () => {
    const g = inProgress();
    g.hand[0] = { id: 1, shapeId: 'removed-shape', color: 'red' };
    const s = parseSave(JSON.stringify({ v: 1, best: { normal: 50 }, endless: { normal: g } }));
    expect(s.endless.normal).toBeUndefined();
    expect(s.best.normal).toBe(50);
  });

  it('finished or future-version runs are not resumed', () => {
    expect(isResumableGame({ ...inProgress(), status: 'lost' })).toBe(false);
    expect(isResumableGame({ ...inProgress(), version: 2 })).toBe(false);
  });
});
