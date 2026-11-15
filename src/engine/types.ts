/**
 * Core engine types.
 *
 * Everything in GameState is plain JSON-serializable data (no classes, no
 * functions, no Maps) so a state can be saved to localStorage, sent over the
 * network, or hashed to check that two clients are in sync.
 */

/** Colour ids used by pieces. The UI maps these to actual RGB + a pattern. */
export const COLOR_IDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
] as const;
export type ColorId = (typeof COLOR_IDS)[number];

/** A filled board cell. `null` is an empty cell. */
export interface Cell {
  kind: 'block' | 'obstacle';
  /** Obstacles have no colour. */
  color: ColorId | null;
}

export interface Board {
  width: number;
  height: number;
  /** Row-major: index = row * width + col. */
  cells: (Cell | null)[];
}

export interface Point {
  row: number;
  col: number;
}

/** A piece in the player's hand. `shapeId` refers to the catalog in pieces.ts. */
export interface HandPiece {
  /** Unique, monotonically increasing id (useful for UI keys / animations). */
  id: number;
  shapeId: string;
  color: ColorId;
}

// ---------------------------------------------------------------------------
// Configuration (all data-driven, see src/data/difficulties.ts)
// ---------------------------------------------------------------------------

/** Piece categories the generator weights by. */
export type PieceCategory =
  | 'single'
  | 'line2'
  | 'line3'
  | 'line4'
  | 'line5'
  | 'square2'
  | 'square3'
  | 'rect'
  | 'smallL'
  | 'L'
  | 'bigL'
  | 'T'
  | 'SZ';

export interface GeneratorConfig {
  /** Relative weight of each category. Split evenly across a category's orientations. */
  categoryWeights: Record<PieceCategory, number>;
  /**
   * Probability (0..1) that a freshly dealt hand is guaranteed to contain at
   * least one piece that fits on the current board. 1 = always (Easy).
   */
  guaranteeFitChance: number;
  /** Pieces per hand. */
  handSize: number;
}

export interface ScoringConfig {
  /** Points for each cell placed. */
  pointsPerCell: number;
  /** Base points for line clears; n lines at once = lineBase * n*(n+1)/2. */
  lineBase: number;
  /** Combo multiplier = 1 + comboStep * (combo - 1) for combo >= 1. */
  comboStep: number;
  /** Bonus when a clear leaves the board completely empty. */
  allClearBonus: number;
}

export interface StarCriterion {
  /** Met if placements used <= maxMoves. */
  maxMoves?: number;
  /** Met if final score >= minScore. */
  minScore?: number;
}

/** Mission goal spec as written in level data. See missions/goals.ts. */
export type GoalSpec =
  | { type: 'clearRows'; target: number }
  | { type: 'clearCols'; target: number }
  | { type: 'clearLines'; target: number }
  | { type: 'blastColor'; color: ColorId; target: number }
  | { type: 'score'; target: number }
  | { type: 'combo'; target: number }
  | { type: 'multiClear'; target: number }
  | { type: 'clearObstacles' }
  | { type: 'survive'; target: number };

export type GoalType = GoalSpec['type'];

export interface MissionConfig {
  goals: GoalSpec[];
  /** Maximum number of placements, if any. */
  moveLimit?: number;
  /**
   * Stars: completing the mission = 1 star. Each criterion in `two` / `three`
   * is OR-ed: e.g. { maxMoves: 20, minScore: 900 } = "under 20 moves OR 900+ points".
   */
  stars?: { two?: StarCriterion; three?: StarCriterion };
}

export interface GameConfig {
  boardWidth: number;
  boardHeight: number;
  /** Colours that pieces can be dealt in. */
  palette: ColorId[];
  generator: GeneratorConfig;
  scoring: ScoringConfig;
  /** Pre-filled cells at game start (obstacles or coloured blocks). */
  initialCells?: { row: number; col: number; cell: Cell }[];
  mission?: MissionConfig;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GoalProgress {
  spec: GoalSpec;
  progress: number;
  target: number;
}

export interface MissionState {
  goals: GoalProgress[];
  moveLimit: number | null;
  stars: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';
export type EndReason = 'noFit' | 'outOfMoves';

export interface GameStats {
  rowsCleared: number;
  colsCleared: number;
  linesCleared: number;
  blocksBlasted: number;
  maxCombo: number;
  maxLinesAtOnce: number;
}

export interface GameState {
  /** Bump if the shape of GameState changes, for saved-game compatibility. */
  version: 1;
  seed: number;
  /** Current RNG state (uint32). */
  rng: number;
  config: GameConfig;
  board: Board;
  /** Fixed-size hand; `null` marks a slot that has been played. */
  hand: (HandPiece | null)[];
  nextPieceId: number;
  score: number;
  /** Consecutive placements that cleared at least one line. */
  combo: number;
  /** Total pieces placed. */
  placements: number;
  stats: GameStats;
  status: GameStatus;
  endReason: EndReason | null;
  mission: MissionState | null;
}

// ---------------------------------------------------------------------------
// Actions & events
// ---------------------------------------------------------------------------

/**
 * Actions are the ONLY way to change state. Phase 2 will add more variants
 * (e.g. `receiveGarbage`, `receiveGift`) without touching existing ones.
 */
export type Action = { type: 'place'; handIndex: number; row: number; col: number };

export interface ClearedCell extends Point {
  cell: Cell;
}

export type GameEvent =
  | { type: 'invalidAction'; reason: string }
  | {
      type: 'piecePlaced';
      piece: HandPiece;
      handIndex: number;
      cells: Point[];
      points: number;
    }
  | {
      type: 'linesCleared';
      rows: number[];
      cols: number[];
      /** Unique cells removed (a cell in both a row and a column appears once). */
      cells: ClearedCell[];
      lines: number;
      points: number;
      combo: number;
    }
  | { type: 'boardCleared'; points: number }
  | { type: 'comboChanged'; combo: number; previous: number }
  | { type: 'scoreChanged'; score: number; delta: number }
  | { type: 'handDealt'; hand: HandPiece[] }
  | { type: 'goalProgress'; index: number; progress: number; target: number; complete: boolean }
  | { type: 'gameWon'; stars: number }
  | { type: 'gameOver'; reason: EndReason };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
