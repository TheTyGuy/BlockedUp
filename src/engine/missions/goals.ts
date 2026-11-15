/**
 * Pluggable mission goal registry.
 *
 * A goal type turns a stream of engine events into a single progress number
 * that counts up towards a target. To add a new goal type:
 *   1. Add its spec to the `GoalSpec` union in engine/types.ts.
 *   2. Register a GoalDefinition below (or call registerGoal from elsewhere).
 *   3. Add a label in ui/goalText.ts and a test in tests/missions.test.ts.
 *
 * Reducers must be pure and monotonic (progress never decreases), so a goal
 * that has been completed stays completed.
 */
import { countCells } from '../board';
import type { GameEvent, GameState, GoalSpec, GoalType } from '../types';

type SpecOf<T extends GoalType> = Extract<GoalSpec, { type: T }>;

export interface GoalDefinition<T extends GoalType = GoalType> {
  type: T;
  /** Target value, computed once when the game is created. */
  target(spec: SpecOf<T>, initial: GameState): number;
  /** Progress after one event. `state` is the state after the whole action. */
  reduce(progress: number, event: GameEvent, spec: SpecOf<T>, state: GameState): number;
}

const registry = new Map<GoalType, GoalDefinition>();

export function registerGoal<T extends GoalType>(def: GoalDefinition<T>): void {
  registry.set(def.type, def as unknown as GoalDefinition);
}

export function getGoal(type: GoalType): GoalDefinition {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown goal type: ${type}`);
  return def;
}

const fromTarget = (spec: { target: number }) => spec.target;

// --- Built-in goal types ----------------------------------------------------

registerGoal({
  type: 'clearRows',
  target: fromTarget,
  reduce: (p, e) => (e.type === 'linesCleared' ? p + e.rows.length : p),
});

registerGoal({
  type: 'clearCols',
  target: fromTarget,
  reduce: (p, e) => (e.type === 'linesCleared' ? p + e.cols.length : p),
});

registerGoal({
  type: 'clearLines',
  target: fromTarget,
  reduce: (p, e) => (e.type === 'linesCleared' ? p + e.lines : p),
});

registerGoal({
  type: 'blastColor',
  target: fromTarget,
  reduce: (p, e, spec) =>
    e.type === 'linesCleared'
      ? p + e.cells.filter((c) => c.cell.kind === 'block' && c.cell.color === spec.color).length
      : p,
});

registerGoal({
  type: 'score',
  target: fromTarget,
  reduce: (p, e, _spec, state) => (e.type === 'scoreChanged' ? Math.max(p, state.score) : p),
});

registerGoal({
  type: 'combo',
  target: fromTarget,
  reduce: (p, e) => (e.type === 'comboChanged' ? Math.max(p, e.combo) : p),
});

registerGoal({
  type: 'multiClear',
  target: fromTarget,
  reduce: (p, e) => (e.type === 'linesCleared' ? Math.max(p, e.lines) : p),
});

registerGoal({
  type: 'clearObstacles',
  // Target = number of obstacles on the board at the start of the level.
  target: (_spec, initial) => countCells(initial.board, (c) => c.kind === 'obstacle'),
  reduce: (p, e) =>
    e.type === 'linesCleared' ? p + e.cells.filter((c) => c.cell.kind === 'obstacle').length : p,
});

registerGoal({
  type: 'survive',
  target: fromTarget,
  reduce: (p, e, _spec, state) => (e.type === 'piecePlaced' ? Math.max(p, state.placements) : p),
});
