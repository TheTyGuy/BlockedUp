/** Mission bookkeeping: goal progress, win check and star rating. */
import type { GameEvent, GameState, MissionConfig, MissionState, StarCriterion } from '../types';
import { getGoal } from './goals';

export function createMissionState(config: MissionConfig, initial: GameState): MissionState {
  return {
    goals: config.goals.map((spec) => ({
      spec,
      progress: 0,
      target: Math.max(0, getGoal(spec.type).target(spec as never, initial)),
    })),
    moveLimit: config.moveLimit ?? null,
    stars: 0,
  };
}

/**
 * Feed the events of one action through every goal. Returns the new mission
 * state plus `goalProgress` events for goals whose progress changed.
 */
export function updateMission(
  mission: MissionState,
  events: readonly GameEvent[],
  state: GameState,
): { mission: MissionState; events: GameEvent[] } {
  const out: GameEvent[] = [];
  const goals = mission.goals.map((g, index) => {
    const def = getGoal(g.spec.type);
    let progress = g.progress;
    for (const e of events) progress = def.reduce(progress, e, g.spec as never, state);
    if (progress !== g.progress) {
      out.push({
        type: 'goalProgress',
        index,
        progress,
        target: g.target,
        complete: progress >= g.target,
      });
    }
    return { ...g, progress };
  });
  return { mission: { ...mission, goals }, events: out };
}

export const allGoalsComplete = (m: MissionState): boolean =>
  m.goals.every((g) => g.progress >= g.target);

/** Criteria are OR-ed: any one satisfied condition earns the star. */
export function criterionMet(c: StarCriterion | undefined, state: GameState): boolean {
  if (!c) return false;
  if (c.maxMoves !== undefined && state.placements <= c.maxMoves) return true;
  if (c.minScore !== undefined && state.score >= c.minScore) return true;
  return false;
}

/** 1 star for winning, +1 for each threshold met (3 requires 2). */
export function computeStars(config: MissionConfig, state: GameState): number {
  const two = criterionMet(config.stars?.two, state);
  const three = two && criterionMet(config.stars?.three, state);
  return 1 + (two ? 1 : 0) + (three ? 1 : 0);
}
