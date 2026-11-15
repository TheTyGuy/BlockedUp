/**
 * Mission campaign levels — edit, reorder or add levels here.
 *
 * Fields:
 *   id        unique, stable string (used for saved progress — don't rename)
 *   name      shown in the level list
 *   size      board is size × size (levels grow AND shrink across the campaign)
 *   colors    colours pieces are dealt in (fewer colours = easier colour goals)
 *   pieces    generator preset from difficulties.ts ('easy' = friendlier pieces)
 *   layout    optional pre-filled board, one string per row:
 *               '.' empty   '#' obstacle (stone)
 *               r o y g c b p k  = red orange yellow green cyan blue purple pink block
 *   goals     ALL must be completed to win (see GoalSpec in engine/types.ts)
 *   moveLimit optional max number of pieces placed
 *   stars     two / three star criteria; each is "maxMoves OR minScore"
 *
 * Difficulty was sanity-checked with `npm run simulate` (a greedy bot).
 */
import type { ColorId, GameConfig, GoalSpec, StarCriterion } from '../engine';
import { DIFFICULTIES, type DifficultyId } from './difficulties';

export interface LevelDef {
  id: string;
  name: string;
  hint?: string;
  size: number;
  colors: ColorId[];
  pieces: DifficultyId;
  layout?: string[];
  goals: GoalSpec[];
  moveLimit?: number;
  stars: { two: StarCriterion; three: StarCriterion };
}

const C3: ColorId[] = ['red', 'blue', 'yellow'];
const C4: ColorId[] = ['red', 'blue', 'yellow', 'green'];
const C5: ColorId[] = ['red', 'blue', 'yellow', 'green', 'purple'];
const C6: ColorId[] = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];

export const LEVELS: LevelDef[] = [
  {
    id: 'l01',
    name: 'First Steps',
    hint: 'Fill a whole row or column to clear it.',
    size: 8,
    colors: C3,
    pieces: 'easy',
    goals: [{ type: 'clearLines', target: 3 }],
    stars: { two: { maxMoves: 14 }, three: { maxMoves: 10 } },
  },
  {
    id: 'l02',
    name: 'Rows & Columns',
    hint: 'Clear both ways!',
    size: 8,
    colors: C3,
    pieces: 'easy',
    goals: [
      { type: 'clearRows', target: 2 },
      { type: 'clearCols', target: 2 },
    ],
    stars: { two: { maxMoves: 20 }, three: { maxMoves: 14 } },
  },
  {
    id: 'l03',
    name: 'Big Sky',
    hint: 'A roomy board. Rack up points.',
    size: 10,
    colors: C4,
    pieces: 'easy',
    goals: [{ type: 'score', target: 250 }],
    stars: { two: { maxMoves: 38 }, three: { maxMoves: 30 } },
  },
  {
    id: 'l04',
    name: 'Red Alert',
    hint: 'Only red blocks count. Clear lines with red in them.',
    size: 9,
    colors: C4,
    pieces: 'easy',
    goals: [{ type: 'blastColor', color: 'red', target: 15 }],
    moveLimit: 45,
    stars: { two: { maxMoves: 24 }, three: { maxMoves: 17 } },
  },
  {
    id: 'l05',
    name: 'Rubble',
    hint: 'Stone blocks only break when their line is cleared.',
    size: 8,
    colors: C4,
    pieces: 'easy',
    layout: [
      '........',
      '.#....#.',
      '........',
      '...##...',
      '........',
      '........',
      '.#....#.',
      '........',
    ],
    goals: [{ type: 'clearObstacles' }],
    moveLimit: 45,
    stars: { two: { maxMoves: 30 }, three: { maxMoves: 20 } },
  },
  {
    id: 'l06',
    name: 'Chain Reaction',
    hint: 'Clear on back-to-back placements to build a combo.',
    size: 9,
    colors: C4,
    pieces: 'easy',
    goals: [
      { type: 'combo', target: 2 },
      { type: 'clearLines', target: 5 },
    ],
    stars: { two: { maxMoves: 26 }, three: { maxMoves: 18 } },
  },
  {
    id: 'l07',
    name: 'Double Trouble',
    hint: 'Clear two lines with a single piece.',
    size: 8,
    colors: C5,
    pieces: 'easy',
    goals: [
      { type: 'multiClear', target: 2 },
      { type: 'clearLines', target: 6 },
    ],
    moveLimit: 50,
    stars: { two: { maxMoves: 34 }, three: { maxMoves: 26 } },
  },
  {
    id: 'l08',
    name: 'Tight Squeeze',
    hint: 'A small board. Just stay alive.',
    size: 7,
    colors: C4,
    pieces: 'easy',
    goals: [{ type: 'survive', target: 25 }],
    stars: { two: { minScore: 220 }, three: { minScore: 380 } },
  },
  {
    id: 'l09',
    name: 'Wide Open',
    size: 10,
    colors: C5,
    pieces: 'normal',
    goals: [{ type: 'clearLines', target: 12 }],
    moveLimit: 55,
    stars: { two: { maxMoves: 42 }, three: { maxMoves: 34 } },
  },
  {
    id: 'l10',
    name: 'Sea & Forest',
    hint: 'Two colours to blast.',
    size: 8,
    colors: C4,
    pieces: 'normal',
    goals: [
      { type: 'blastColor', color: 'blue', target: 15 },
      { type: 'blastColor', color: 'green', target: 15 },
    ],
    moveLimit: 60,
    stars: { two: { maxMoves: 36 }, three: { maxMoves: 28 } },
  },
  {
    id: 'l11',
    name: 'Fortress',
    size: 9,
    colors: C5,
    pieces: 'normal',
    layout: [
      '.........',
      '.........',
      '..#####..',
      '..#...#..',
      '..#...#..',
      '..#...#..',
      '..#####..',
      '.........',
      '.........',
    ],
    goals: [{ type: 'clearObstacles' }],
    moveLimit: 60,
    stars: { two: { maxMoves: 30 }, three: { maxMoves: 22 } },
  },
  {
    id: 'l12',
    name: 'Combo Master',
    hint: 'Keep the streak going!',
    size: 8,
    colors: C5,
    pieces: 'easy',
    goals: [
      { type: 'combo', target: 3 },
      { type: 'score', target: 450 },
    ],
    moveLimit: 70,
    stars: { two: { maxMoves: 50 }, three: { maxMoves: 38 } },
  },
  {
    id: 'l13',
    name: 'Little Box',
    hint: 'Six by six. Every cell counts.',
    size: 6,
    colors: C4,
    pieces: 'easy',
    goals: [{ type: 'clearLines', target: 10 }],
    moveLimit: 40,
    stars: { two: { maxMoves: 22 }, three: { maxMoves: 17 } },
  },
  {
    id: 'l14',
    name: 'Breathing Room',
    hint: 'Line up three rows missing the same spot, then fill them in one go.',
    size: 10,
    colors: C6,
    pieces: 'easy',
    goals: [
      { type: 'multiClear', target: 3 },
      { type: 'score', target: 500 },
    ],
    moveLimit: 100,
    stars: { two: { maxMoves: 60 }, three: { maxMoves: 45 } },
  },
  {
    id: 'l15',
    name: 'Purple Patch',
    hint: 'Some purple is already on the board.',
    size: 8,
    colors: C5,
    pieces: 'easy',
    layout: [
      'pp....pp',
      'p......p',
      '...##...',
      '........',
      '........',
      '...##...',
      'p......p',
      'pp....pp',
    ],
    goals: [{ type: 'blastColor', color: 'purple', target: 14 }, { type: 'clearObstacles' }],
    moveLimit: 70,
    stars: { two: { maxMoves: 30 }, three: { maxMoves: 22 } },
  },
  {
    id: 'l16',
    name: 'Marathon',
    size: 9,
    colors: C6,
    pieces: 'normal',
    goals: [
      { type: 'survive', target: 60 },
      { type: 'clearLines', target: 24 },
    ],
    stars: { two: { minScore: 600 }, three: { minScore: 850 } },
  },
  {
    id: 'l17',
    name: 'Rainbow',
    size: 8,
    colors: C6,
    pieces: 'normal',
    goals: [
      { type: 'blastColor', color: 'red', target: 12 },
      { type: 'blastColor', color: 'yellow', target: 12 },
      { type: 'blastColor', color: 'blue', target: 12 },
    ],
    moveLimit: 75,
    stars: { two: { maxMoves: 46 }, three: { maxMoves: 36 } },
  },
  {
    id: 'l18',
    name: 'Cramped Quarters',
    size: 6,
    colors: C5,
    pieces: 'easy',
    layout: ['#....#', '......', '......', '......', '......', '#....#'],
    goals: [{ type: 'clearObstacles' }, { type: 'clearLines', target: 10 }],
    moveLimit: 45,
    stars: { two: { maxMoves: 24 }, three: { maxMoves: 19 } },
  },
  {
    id: 'l19',
    name: 'Grand Canvas',
    size: 10,
    colors: C6,
    pieces: 'hard',
    goals: [
      { type: 'clearRows', target: 8 },
      { type: 'clearCols', target: 8 },
      { type: 'combo', target: 3 },
    ],
    moveLimit: 90,
    stars: { two: { maxMoves: 70 }, three: { maxMoves: 58 } },
  },
  {
    id: 'l20',
    name: 'Final Exam',
    hint: 'Everything you have learned.',
    size: 7,
    colors: C6,
    pieces: 'normal',
    layout: ['.......', '.#...#.', '.......', '...#...', '.......', '.#...#.', '.......'],
    goals: [
      { type: 'clearObstacles' },
      { type: 'multiClear', target: 2 },
      { type: 'score', target: 600 },
    ],
    moveLimit: 70,
    stars: { two: { maxMoves: 55 }, three: { maxMoves: 45 } },
  },
];

const LETTER_COLORS: Record<string, ColorId> = {
  r: 'red',
  o: 'orange',
  y: 'yellow',
  g: 'green',
  c: 'cyan',
  b: 'blue',
  p: 'purple',
  k: 'pink',
};

/** Parse a level layout into engine initial cells. Throws on malformed data. */
export function parseLayout(level: LevelDef): GameConfig['initialCells'] {
  if (!level.layout) return [];
  if (level.layout.length !== level.size) {
    throw new Error(
      `Level ${level.id}: layout has ${level.layout.length} rows, expected ${level.size}`,
    );
  }
  const cells: NonNullable<GameConfig['initialCells']> = [];
  level.layout.forEach((line, row) => {
    if (line.length !== level.size)
      throw new Error(`Level ${level.id}: row ${row} has wrong length`);
    [...line].forEach((ch, col) => {
      if (ch === '.') return;
      if (ch === '#') cells.push({ row, col, cell: { kind: 'obstacle', color: null } });
      else if (LETTER_COLORS[ch])
        cells.push({ row, col, cell: { kind: 'block', color: LETTER_COLORS[ch] } });
      else throw new Error(`Level ${level.id}: unknown layout char '${ch}'`);
    });
  });
  return cells;
}

/** Build the engine config for a level. */
export function levelConfig(level: LevelDef): GameConfig {
  const preset = DIFFICULTIES[level.pieces];
  return {
    boardWidth: level.size,
    boardHeight: level.size,
    palette: level.colors,
    generator: preset.generator,
    scoring: preset.scoring,
    initialCells: parseLayout(level),
    mission: { goals: level.goals, moveLimit: level.moveLimit, stars: level.stars },
  };
}

export const levelIndex = (id: string): number => LEVELS.findIndex((l) => l.id === id);
