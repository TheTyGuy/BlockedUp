import { createGame, type GameConfig, type GameState, type HandPiece } from '../src/engine';
import { endlessConfig } from '../src/data/difficulties';

/**
 * Build a state with an exact board and hand.
 * Board art: '.' empty, '#' obstacle, letters r/o/y/g/c/b/p/k = coloured block.
 */
export function makeState(opts: {
  board: string[];
  hand: (string | null)[];
  config?: Partial<GameConfig>;
  colors?: HandPiece['color'][];
}): GameState {
  const height = opts.board.length;
  const width = opts.board[0].length;
  const config: GameConfig = {
    ...endlessConfig('normal'),
    boardWidth: width,
    boardHeight: height,
    ...opts.config,
  };
  const base = createGame({ ...config, mission: undefined }, 1);
  const letters: Record<string, HandPiece['color']> = {
    r: 'red',
    o: 'orange',
    y: 'yellow',
    g: 'green',
    c: 'cyan',
    b: 'blue',
    p: 'purple',
    k: 'pink',
  };
  const cells = opts.board.flatMap((line) =>
    [...line].map((ch) => {
      if (ch === '.') return null;
      if (ch === '#') return { kind: 'obstacle' as const, color: null };
      return { kind: 'block' as const, color: letters[ch] ?? 'red' };
    }),
  );
  const hand = opts.hand.map((shapeId, i) =>
    shapeId ? { id: 100 + i, shapeId, color: opts.colors?.[i] ?? 'blue' } : null,
  );
  const state: GameState = { ...base, config, board: { width, height, cells }, hand };
  if (config.mission) {
    // Re-create the mission against the custom board (targets like clearObstacles depend on it).
    const withMission = createGame(config, 1);
    state.mission = {
      ...withMission.mission!,
      goals: withMission.mission!.goals.map((g) =>
        g.spec.type === 'clearObstacles'
          ? { ...g, target: cells.filter((c) => c?.kind === 'obstacle').length }
          : g,
      ),
    };
  }
  return state;
}

export const row = (s: string, n = 8) => s.padEnd(n, '.');
