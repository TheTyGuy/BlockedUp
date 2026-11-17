/** Human-readable labels for mission goals. Add a case when adding a goal type. */
import type { GoalSpec } from '../engine';
import { BLOCK_COLORS } from './theme';

export function goalLabel(spec: GoalSpec, target: number): string {
  switch (spec.type) {
    case 'clearRows':
      return `Clear ${target} row${target === 1 ? '' : 's'}`;
    case 'clearCols':
      return `Clear ${target} column${target === 1 ? '' : 's'}`;
    case 'clearLines':
      return `Clear ${target} line${target === 1 ? '' : 's'}`;
    case 'blastColor':
      return `Blast ${target} ${BLOCK_COLORS[spec.color].name.toLowerCase()}`;
    case 'score':
      return `Score ${target}`;
    case 'combo':
      return `Combo ×${target}`;
    case 'multiClear':
      return `${target} lines at once`;
    case 'clearObstacles':
      return `Break all ${target} stones`;
    case 'survive':
      return `Place ${target} pieces`;
    case 'reveal':
      return 'Uncover the photo';
  }
}

/** Short icon/emoji for compact goal chips. */
export function goalIcon(spec: GoalSpec): string {
  switch (spec.type) {
    case 'clearRows':
      return '↔';
    case 'clearCols':
      return '↕';
    case 'clearLines':
      return '✚';
    case 'blastColor':
      return '●';
    case 'score':
      return '★';
    case 'combo':
      return '🔥';
    case 'multiClear':
      return '⚡';
    case 'clearObstacles':
      return '🪨';
    case 'survive':
      return '⏳';
    case 'reveal':
      return '🖼️';
  }
}
