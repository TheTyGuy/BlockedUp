/**
 * Difficulty presets — edit freely to tune the game.
 *
 * Board size: bigger = easier. Generator weights: higher numbers make that
 * category of piece more common (each weight is shared across the category's
 * orientations, so "L: 6" means all 8 L orientations together get weight 6).
 */
import type { ColorId, GameConfig, GeneratorConfig, ScoringConfig } from '../engine';

export type DifficultyId = 'easy' | 'normal' | 'hard' | 'brutal';

export interface DifficultyPreset {
  id: DifficultyId;
  name: string;
  blurb: string;
  boardSize: number;
  palette: ColorId[];
  generator: GeneratorConfig;
  scoring: ScoringConfig;
}

const ALL_COLORS: ColorId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
];

const BASE_SCORING: ScoringConfig = {
  pointsPerCell: 1,
  lineBase: 10,
  comboStep: 0.5,
  allClearBonus: 150,
};

export const DIFFICULTIES: Record<DifficultyId, DifficultyPreset> = {
  easy: {
    id: 'easy',
    name: 'Easy',
    blurb: '10×10 board, friendly pieces',
    boardSize: 10,
    palette: ALL_COLORS,
    generator: {
      handSize: 3,
      guaranteeFitChance: 1,
      categoryWeights: {
        single: 5,
        line2: 9,
        line3: 9,
        line4: 6,
        line5: 3,
        square2: 8,
        square3: 2,
        rect: 3,
        smallL: 9,
        L: 6,
        bigL: 2,
        T: 4,
        SZ: 2,
      },
    },
    scoring: BASE_SCORING,
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    blurb: '8×8 board, the classic',
    boardSize: 8,
    palette: ALL_COLORS,
    generator: {
      handSize: 3,
      guaranteeFitChance: 0.5,
      categoryWeights: {
        single: 3,
        line2: 7,
        line3: 8,
        line4: 6,
        line5: 4,
        square2: 7,
        square3: 3,
        rect: 4,
        smallL: 7,
        L: 7,
        bigL: 4,
        T: 5,
        SZ: 4,
      },
    },
    scoring: BASE_SCORING,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    blurb: '7×7 board, chunkier pieces',
    boardSize: 7,
    palette: ALL_COLORS,
    generator: {
      handSize: 3,
      guaranteeFitChance: 0,
      categoryWeights: {
        single: 1,
        line2: 4,
        line3: 6,
        line4: 6,
        line5: 5,
        square2: 6,
        square3: 4,
        rect: 5,
        smallL: 5,
        L: 8,
        bigL: 5,
        T: 6,
        SZ: 6,
      },
    },
    scoring: { ...BASE_SCORING, lineBase: 12 },
  },
  brutal: {
    id: 'brutal',
    name: 'Brutal',
    blurb: '6×6 board, awkward everything',
    boardSize: 6,
    palette: ALL_COLORS,
    generator: {
      handSize: 3,
      guaranteeFitChance: 0,
      categoryWeights: {
        single: 0.5,
        line2: 3,
        line3: 5,
        line4: 5,
        line5: 4,
        square2: 5,
        square3: 4,
        rect: 5,
        smallL: 4,
        L: 8,
        bigL: 6,
        T: 7,
        SZ: 8,
      },
    },
    scoring: { ...BASE_SCORING, lineBase: 15 },
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'brutal'];

/** Build an Endless-mode engine config from a preset. */
export function endlessConfig(id: DifficultyId): GameConfig {
  const d = DIFFICULTIES[id];
  return {
    boardWidth: d.boardSize,
    boardHeight: d.boardSize,
    palette: d.palette,
    generator: d.generator,
    scoring: d.scoring,
  };
}
