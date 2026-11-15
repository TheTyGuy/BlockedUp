/**
 * Plays every level (and each Endless difficulty) many times with a greedy
 * bot and prints win rates / stars, to sanity-check the difficulty curve.
 *
 *   npm run simulate            # 40 runs per level
 *   npm run simulate -- 100     # 100 runs per level
 *
 * A human who plans ahead will do better than this bot; use the numbers as a
 * relative difficulty signal, not an absolute one.
 */
import { createGame } from '../src/engine';
import { LEVELS, levelConfig } from '../src/data/levels';
import { DIFFICULTY_ORDER, endlessConfig } from '../src/data/difficulties';
import { playOut } from './bot';

const runs = Number(process.argv[2] ?? 40);

console.log(`Missions (${runs} runs each)`);
console.log('level  size  win%  avgStars  avgMoves(won)');
for (const level of LEVELS) {
  let wins = 0;
  let stars = 0;
  let moves = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const end = playOut(createGame(levelConfig(level), seed * 7919));
    if (end.status === 'won') {
      wins++;
      stars += end.mission!.stars;
      moves += end.placements;
    }
  }
  console.log(
    `${level.id}   ${String(level.size).padStart(2)}   ${String(Math.round((wins / runs) * 100)).padStart(3)}%  ` +
      `${(wins ? stars / wins : 0).toFixed(2).padStart(8)}  ${(wins ? moves / wins : 0).toFixed(1).padStart(8)}   ${level.name}`,
  );
}

console.log(`\nEndless (${runs} runs each)`);
for (const id of DIFFICULTY_ORDER) {
  let total = 0;
  let placements = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const end = playOut(createGame(endlessConfig(id), seed * 104729), 400);
    total += end.score;
    placements += end.placements;
  }
  console.log(
    `${id.padEnd(7)} avg score ${Math.round(total / runs)}  avg placements ${Math.round(placements / runs)}`,
  );
}
