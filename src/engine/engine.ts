/**
 * The game engine: a pure reducer.
 *
 *   const state = createGame(config, seed);
 *   const { state: next, events } = apply(state, { type: 'place', handIndex, row, col });
 *
 * - Never mutates its input.
 * - Deterministic: same (state, action) => same (state, events).
 * - No DOM, timers or Math.random; randomness comes from the seeded RNG in state.
 *
 * Events describe *what happened* and drive both UI effects (animations,
 * sounds) and mission tracking.
 */
import {
  canPlace,
  cellsFor,
  clearLines,
  createBoard,
  findFullLines,
  fitsAnywhere,
  idx,
  isEmpty,
  placeCells,
} from './board';
import { dealHand } from './generator';
import {
  allGoalsComplete,
  computeStars,
  createMissionState,
  updateMission,
} from './missions/tracker';
import { getShape } from './pieces';
import { Rng, seedFrom } from './rng';
import { clearPoints, placementPoints } from './scoring';
import { dropJunk, garbageFor } from './versus';
import type { Action, ApplyResult, GameConfig, GameEvent, GameState, Point } from './types';

/** Create a new game. The first hand is dealt immediately. */
export function createGame(config: GameConfig, seed: number): GameState {
  const board = createBoard(config.boardWidth, config.boardHeight);
  for (const { row, col, cell } of config.initialCells ?? []) {
    board.cells[idx(board, row, col)] = { ...cell };
  }
  const rng = new Rng(seedFrom(seed));
  const dealt = dealHand(rng, board, config.generator, config.palette, 1);

  const state: GameState = {
    version: 1,
    seed: seedFrom(seed),
    rng: rng.state,
    config,
    board,
    hand: dealt.hand,
    nextPieceId: dealt.nextPieceId,
    score: 0,
    combo: 0,
    placements: 0,
    stats: {
      rowsCleared: 0,
      colsCleared: 0,
      linesCleared: 0,
      blocksBlasted: 0,
      maxCombo: 0,
      maxLinesAtOnce: 0,
    },
    status: 'playing',
    endReason: null,
    mission: null,
  };
  if (config.mission) state.mission = createMissionState(config.mission, state);
  if (!handFits(state).some(Boolean)) {
    state.status = 'lost';
    state.endReason = 'noFit';
  }
  return state;
}

/** Apply an action. Invalid actions return the unchanged state and an `invalidAction` event. */
export function apply(state: GameState, action: Action): ApplyResult {
  switch (action.type) {
    case 'place':
      return applyPlace(state, action);
    case 'receiveGarbage':
      return applyGarbage(state, action);
    default: {
      const unknown: never = action;
      return invalid(state, `Unknown action: ${(unknown as { type: string }).type}`);
    }
  }
}

function invalid(state: GameState, reason: string): ApplyResult {
  return { state, events: [{ type: 'invalidAction', reason }] };
}

function applyPlace(state: GameState, action: Extract<Action, { type: 'place' }>): ApplyResult {
  if (state.status !== 'playing') return invalid(state, 'Game is over');
  const piece = state.hand[action.handIndex];
  if (!piece) return invalid(state, 'No piece in that hand slot');
  const shape = getShape(piece.shapeId);
  if (!canPlace(state.board, shape, action.row, action.col)) {
    return invalid(state, 'Piece does not fit there');
  }

  const cfg = state.config;
  const events: GameEvent[] = [];
  const stats = { ...state.stats };
  const startScore = state.score;
  let score = state.score;

  // 1. Place the piece.
  const placed = cellsFor(shape, action.row, action.col);
  let board = placeCells(state.board, placed, { kind: 'block', color: piece.color });
  const placePts = placementPoints(cfg.scoring, placed.length);
  score += placePts;
  const placements = state.placements + 1;
  events.push({
    type: 'piecePlaced',
    piece,
    handIndex: action.handIndex,
    cells: placed,
    points: placePts,
  });

  // 2. Clear full rows and columns simultaneously.
  const { rows, cols } = findFullLines(board);
  const lines = rows.length + cols.length;
  const combo = lines > 0 ? state.combo + 1 : 0;
  if (lines > 0) {
    const result = clearLines(board, rows, cols);
    board = result.board;
    const pts = clearPoints(cfg.scoring, lines, combo);
    score += pts;
    stats.rowsCleared += rows.length;
    stats.colsCleared += cols.length;
    stats.linesCleared += lines;
    stats.blocksBlasted += result.cleared.length;
    stats.maxLinesAtOnce = Math.max(stats.maxLinesAtOnce, lines);
    events.push({
      type: 'linesCleared',
      rows,
      cols,
      cells: result.cleared,
      lines,
      points: pts,
      combo,
    });
    if (isEmpty(board) && cfg.scoring.allClearBonus > 0) {
      score += cfg.scoring.allClearBonus;
      events.push({ type: 'boardCleared', points: cfg.scoring.allClearBonus });
    }
  }
  stats.maxCombo = Math.max(stats.maxCombo, combo);
  if (combo !== state.combo) events.push({ type: 'comboChanged', combo, previous: state.combo });
  if (cfg.versus && lines > 0) {
    const cells = garbageFor(cfg.versus, lines, combo);
    if (cells > 0) events.push({ type: 'garbageSent', cells });
  }
  events.push({ type: 'scoreChanged', score, delta: score - startScore });

  // 3. Update the hand; deal a new one once every slot has been played.
  let hand = state.hand.slice();
  hand[action.handIndex] = null;
  let rngState = state.rng;
  let nextPieceId = state.nextPieceId;
  if (hand.every((h) => h === null)) {
    const rng = new Rng(rngState);
    const dealt = dealHand(rng, board, cfg.generator, cfg.palette, nextPieceId);
    hand = dealt.hand;
    nextPieceId = dealt.nextPieceId;
    rngState = rng.state;
    events.push({ type: 'handDealt', hand: dealt.hand });
  }

  let next: GameState = {
    ...state,
    rng: rngState,
    board,
    hand,
    nextPieceId,
    score,
    combo,
    placements,
    stats,
  };

  // 4. Missions: update goal progress, then check win / lose.
  if (next.mission) {
    const m = updateMission(next.mission, events, next);
    next = { ...next, mission: m.mission };
    events.push(...m.events);
    if (allGoalsComplete(m.mission)) {
      const stars = computeStars(cfg.mission!, next);
      next = { ...next, status: 'won', mission: { ...m.mission, stars } };
      events.push({ type: 'gameWon', stars });
      return { state: next, events };
    }
    if (m.mission.moveLimit !== null && placements >= m.mission.moveLimit) {
      next = { ...next, status: 'lost', endReason: 'outOfMoves' };
      events.push({ type: 'gameOver', reason: 'outOfMoves' });
      return { state: next, events };
    }
  }

  // 5. Game over when nothing left in hand fits anywhere.
  if (!handFits(next).some(Boolean)) {
    next = { ...next, status: 'lost', endReason: 'noFit' };
    events.push({ type: 'gameOver', reason: 'noFit' });
  }
  return { state: next, events };
}

/** Versus: drop junk blocks from the opponent onto this board. */
function applyGarbage(
  state: GameState,
  action: Extract<Action, { type: 'receiveGarbage' }>,
): ApplyResult {
  if (state.status !== 'playing') return invalid(state, 'Game is over');
  const max = state.board.width * state.board.height;
  if (!Number.isInteger(action.cells) || action.cells < 0 || action.cells > max) {
    return invalid(state, 'Bad garbage amount');
  }
  const rng = new Rng(state.rng);
  const dropped = dropJunk(state.board, action.cells, rng);
  let next: GameState = { ...state, board: dropped.board, rng: rng.state };
  const events: GameEvent[] = [{ type: 'garbageReceived', cells: dropped.cells }];
  if (!handFits(next).some(Boolean)) {
    next = { ...next, status: 'lost', endReason: 'noFit' };
    events.push({ type: 'gameOver', reason: 'noFit' });
  }
  return { state: next, events };
}

// ---------------------------------------------------------------------------
// Read-only queries (used by the UI for previews; never change state)
// ---------------------------------------------------------------------------

/** For each hand slot: can that piece be placed anywhere? (false for empty slots) */
export function handFits(state: GameState): boolean[] {
  return state.hand.map((p) => (p ? fitsAnywhere(state.board, getShape(p.shapeId)) : false));
}

export interface PlacementPreview {
  valid: boolean;
  cells: Point[];
  /** Rows / columns that would be cleared by this placement. */
  rows: number[];
  cols: number[];
}

/** What would happen if the piece in `handIndex` were placed at (row, col)? */
export function previewPlacement(
  state: GameState,
  handIndex: number,
  row: number,
  col: number,
): PlacementPreview {
  const piece = state.hand[handIndex];
  if (!piece) return { valid: false, cells: [], rows: [], cols: [] };
  const shape = getShape(piece.shapeId);
  const cells = cellsFor(shape, row, col);
  if (!canPlace(state.board, shape, row, col)) return { valid: false, cells, rows: [], cols: [] };
  const board = placeCells(state.board, cells, { kind: 'block', color: piece.color });
  return { valid: true, cells, ...findFullLines(board) };
}
