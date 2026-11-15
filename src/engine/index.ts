/** Public engine API. The UI (and a future network layer) should import from here only. */
export * from './types';
export { createGame, apply, handFits, previewPlacement, type PlacementPreview } from './engine';
export { PIECES, getShape, type PieceShape } from './pieces';
export { seedFrom, seedFromString } from './rng';
export { registerGoal, getGoal, type GoalDefinition } from './missions/goals';
export { computeStars } from './missions/tracker';
