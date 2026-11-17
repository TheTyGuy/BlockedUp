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
 *   world     which world the level belongs to (see WORLDS below; default 1)
 *   cover     cover tiles hiding a photo. Either one number for every cell, or
 *             one string of digits per row. The digit is how many line clears
 *             it takes to break through that cell. Photo levels must cover
 *             EVERY cell, so the picture stays a surprise.
 *             Use with the goal { type: 'reveal' }.
 *   photo     id from photos.ts shown under the cover and added to the album
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
  world?: number;
  cover?: number | string[];
  photo?: string;
}

export interface WorldDef {
  id: number;
  name: string;
  blurb: string;
}

/** Worlds group levels in the level list. Levels unlock in LEVELS order. */
export const WORLDS: WorldDef[] = [
  { id: 1, name: 'Block Basics', blurb: 'Learn the ropes' },
  { id: 2, name: 'Tile Breaker', blurb: 'Clear lines to smash every tile on the board' },
];

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

  // ---------------------------------------------------------------- World 2
  // Tile Breaker: every level hides a photo under cover tiles.
  {
    id: 'l21',
    world: 2,
    name: 'Peekaboo',
    hint: 'Clear a line across the tiles to break them. What is hiding underneath?',
    size: 7,
    colors: C4,
    pieces: 'easy',
    photo: 'plaid-hood',
    cover: 1,
    goals: [{ type: 'reveal' }],
    stars: { two: { maxMoves: 24 }, three: { maxMoves: 18 } },
  },
  {
    id: 'l22',
    world: 2,
    name: 'Blanket Burrito',
    hint: 'Every tile needs a line cleared across it.',
    size: 8,
    colors: C4,
    pieces: 'easy',
    photo: 'blanket-burrito',
    cover: 1,
    goals: [{ type: 'reveal' }],
    stars: { two: { maxMoves: 27 }, three: { maxMoves: 20 } },
  },
  {
    id: 'l23',
    world: 2,
    name: 'Walkies',
    size: 7,
    colors: C4,
    pieces: 'easy',
    photo: 'walk-tongue',
    cover: 1,
    goals: [{ type: 'reveal' }],
    moveLimit: 45,
    stars: { two: { maxMoves: 24 }, three: { maxMoves: 18 } },
  },
  {
    id: 'l24',
    world: 2,
    name: 'Little Red',
    hint: 'Thick tiles crack first. Clear across them again to break through.',
    size: 8,
    colors: C5,
    pieces: 'easy',
    photo: 'red-blanket',
    cover: [
      '11111111',
      '11111111',
      '11222211',
      '11222211',
      '11222211',
      '11222211',
      '11111111',
      '11111111',
    ],
    goals: [{ type: 'reveal' }],
    stars: { two: { maxMoves: 44 }, three: { maxMoves: 33 } },
  },
  {
    id: 'l25',
    world: 2,
    name: 'Mlem',
    size: 6,
    colors: C4,
    pieces: 'easy',
    photo: 'lick',
    cover: 2,
    goals: [{ type: 'reveal' }],
    moveLimit: 55,
    stars: { two: { maxMoves: 35 }, three: { maxMoves: 26 } },
  },
  {
    id: 'l26',
    world: 2,
    name: 'Cheese!',
    hint: 'A big board. Work across it row by row.',
    size: 9,
    colors: C5,
    pieces: 'normal',
    photo: 'happy-grin',
    cover: 1,
    goals: [{ type: 'reveal' }],
    moveLimit: 60,
    stars: { two: { maxMoves: 36 }, three: { maxMoves: 28 } },
  },
  {
    id: 'l27',
    world: 2,
    name: 'Sun Worshipper',
    size: 8,
    colors: C5,
    pieces: 'easy',
    photo: 'sun-squint',
    cover: 2,
    goals: [{ type: 'reveal' }],
    moveLimit: 90,
    stars: { two: { maxMoves: 58 }, three: { maxMoves: 45 } },
  },
  {
    id: 'l28',
    world: 2,
    name: 'Sweet Dreams',
    hint: 'Stones are in the way. Clear their lines to move them.',
    size: 7,
    colors: C5,
    pieces: 'easy',
    photo: 'nap',
    cover: 2,
    layout: ['.......', '.#...#.', '.......', '.......', '.......', '.#...#.', '.......'],
    goals: [{ type: 'reveal' }],
    moveLimit: 75,
    stars: { two: { maxMoves: 46 }, three: { maxMoves: 36 } },
  },
  {
    id: 'l29',
    world: 2,
    name: 'Blep',
    size: 10,
    colors: C6,
    pieces: 'normal',
    photo: 'tongue-portrait',
    cover: [
      '1111111111',
      '1222222221',
      '1211111121',
      '1212222121',
      '1212112121',
      '1212112121',
      '1212222121',
      '1211111121',
      '1222222221',
      '1111111111',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 110,
    stars: { two: { maxMoves: 74 }, three: { maxMoves: 58 } },
  },
  {
    id: 'l30',
    world: 2,
    name: 'Let Us In',
    hint: 'The whole gang is behind this one.',
    size: 8,
    colors: C6,
    pieces: 'normal',
    photo: 'screen-door',
    cover: 2,
    goals: [{ type: 'reveal' }, { type: 'combo', target: 3 }],
    moveLimit: 95,
    stars: { two: { maxMoves: 62 }, three: { maxMoves: 50 } },
  },
  {
    id: 'l31',
    world: 2,
    name: 'Pretty in Pink',
    hint: 'Framed tiles are thick: they need two clears.',
    size: 8,
    colors: C5,
    pieces: 'easy',
    photo: 'pink-portrait',
    cover: [
      '22222222',
      '11111111',
      '22222222',
      '11111111',
      '22222222',
      '11111111',
      '22222222',
      '11111111',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 70,
    stars: { two: { maxMoves: 45 }, three: { maxMoves: 36 } },
  },
  {
    id: 'l32',
    world: 2,
    name: 'Big Smile',
    size: 7,
    colors: C5,
    pieces: 'easy',
    photo: 'big-smile',
    cover: 2,
    layout: ['.......', '.......', '.......', '...#...', '.......', '.......', '.......'],
    goals: [{ type: 'reveal' }],
    moveLimit: 65,
    stars: { two: { maxMoves: 42 }, three: { maxMoves: 34 } },
  },
  {
    id: 'l33',
    world: 2,
    name: 'Deep Thoughts',
    size: 9,
    colors: C5,
    pieces: 'normal',
    photo: 'looking-down',
    cover: [
      '222222222',
      '211111112',
      '211111112',
      '211111112',
      '211111112',
      '211111112',
      '211111112',
      '211111112',
      '222222222',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 90,
    stars: { two: { maxMoves: 58 }, three: { maxMoves: 46 } },
  },
  {
    id: 'l34',
    world: 2,
    name: 'Sunbather',
    hint: 'Two jobs: break the tiles and blast plenty of yellow.',
    size: 8,
    colors: C4,
    pieces: 'easy',
    photo: 'sunbather',
    cover: 2,
    goals: [{ type: 'reveal' }, { type: 'blastColor', color: 'yellow', target: 40 }],
    moveLimit: 95,
    stars: { two: { maxMoves: 63 }, three: { maxMoves: 50 } },
  },
  {
    id: 'l35',
    world: 2,
    name: 'Milk Moustache',
    hint: 'Awkward pieces this time. Keep some space open.',
    size: 7,
    colors: C5,
    pieces: 'normal',
    photo: 'milk-moustache',
    cover: 2,
    goals: [{ type: 'reveal' }],
    moveLimit: 65,
    stars: { two: { maxMoves: 41 }, three: { maxMoves: 33 } },
  },
  {
    id: 'l36',
    world: 2,
    name: 'Tongue Out',
    size: 10,
    colors: C6,
    pieces: 'normal',
    photo: 'tongue-out',
    cover: [
      '1212121212',
      '2121212121',
      '1212121212',
      '2121212121',
      '1212121212',
      '2121212121',
      '1212121212',
      '2121212121',
      '1212121212',
      '2121212121',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 115,
    stars: { two: { maxMoves: 76 }, three: { maxMoves: 60 } },
  },
  {
    id: 'l37',
    world: 2,
    name: 'Kisses',
    hint: 'Double-framed tiles need three clears.',
    size: 8,
    colors: C5,
    pieces: 'easy',
    photo: 'kisses',
    cover: [
      '11111111',
      '11111111',
      '11333311',
      '11333311',
      '11333311',
      '11333311',
      '11111111',
      '11111111',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 80,
    stars: { two: { maxMoves: 53 }, three: { maxMoves: 42 } },
  },
  {
    id: 'l38',
    world: 2,
    name: 'Pup Cup',
    size: 7,
    colors: C5,
    pieces: 'easy',
    photo: 'pup-cup',
    cover: 2,
    goals: [{ type: 'reveal' }, { type: 'multiClear', target: 2 }],
    moveLimit: 70,
    stars: { two: { maxMoves: 45 }, three: { maxMoves: 36 } },
  },
  {
    id: 'l39',
    world: 2,
    name: 'Snack Time',
    size: 9,
    colors: C6,
    pieces: 'normal',
    photo: 'snack-time',
    cover: 2,
    layout: [
      '.........',
      '.#.....#.',
      '.........',
      '.........',
      '....#....',
      '.........',
      '.........',
      '.#.....#.',
      '.........',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 105,
    stars: { two: { maxMoves: 68 }, three: { maxMoves: 54 } },
  },
  {
    id: 'l40',
    world: 2,
    name: 'Porch Party',
    hint: 'The toughest tiles yet. Everyone is waiting behind them.',
    size: 8,
    colors: C6,
    pieces: 'normal',
    photo: 'porch-trio',
    cover: [
      '22222222',
      '22222222',
      '22333322',
      '22333322',
      '22333322',
      '22333322',
      '22222222',
      '22222222',
    ],
    goals: [{ type: 'reveal' }],
    moveLimit: 95,
    stars: { two: { maxMoves: 61 }, three: { maxMoves: 49 } },
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

/** Turn a level's `cover` into the engine's per-cell layer counts. Throws on malformed data. */
export function parseCover(level: LevelDef): number[] | undefined {
  const { cover, size } = level;
  if (cover === undefined) return undefined;
  if (typeof cover === 'number') return new Array<number>(size * size).fill(cover);
  if (cover.length !== size) throw new Error(`Level ${level.id}: cover has ${cover.length} rows`);
  return cover.flatMap((line, row) => {
    if (line.length !== size)
      throw new Error(`Level ${level.id}: cover row ${row} has wrong length`);
    return [...line].map((ch) => {
      if (ch === '.') return 0;
      if (ch < '0' || ch > '9') throw new Error(`Level ${level.id}: bad cover char '${ch}'`);
      return Number(ch);
    });
  });
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
    cover: parseCover(level),
    mission: { goals: level.goals, moveLimit: level.moveLimit, stars: level.stars },
  };
}

export const levelIndex = (id: string): number => LEVELS.findIndex((l) => l.id === id);
