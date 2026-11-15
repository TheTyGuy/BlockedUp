/** Results screen for both Endless and Missions. */
import { DIFFICULTIES } from '../../data/difficulties';
import { LEVELS, levelIndex } from '../../data/levels';
import type { App, Screen } from '../app';
import { h } from '../dom';
import type { GameSession } from '../game/session';
import { goalLabel } from '../goalText';
import { store } from '../storage';
import { startEndless, startMission } from './game';
import { difficultyScreen, homeScreen, levelsScreen } from './menus';

function stat(label: string, value: string | number): HTMLElement {
  return h('div', { class: 'stat' }, h('span', {}, label), h('strong', {}, String(value)));
}

export function resultsScreen(app: App, session: GameSession, newBest: boolean): Screen {
  const s = session.state;
  const mode = session.mode;
  const stats = h(
    'div',
    { class: 'stats' },
    stat('Lines', s.stats.linesCleared),
    stat('Best combo', s.stats.maxCombo),
    stat('Pieces', s.placements),
  );

  if (mode.kind === 'endless') {
    const d = DIFFICULTIES[mode.difficulty];
    return {
      el: h(
        'div',
        { class: 'screen menu results' },
        h('h2', { class: 'results-title' }, 'No more room!'),
        h('div', { class: 'subtle' }, `${d.name} · ${d.boardSize}×${d.boardSize}`),
        h('div', { class: 'big-score' }, String(s.score)),
        newBest
          ? h('div', { class: 'badge' }, '🏆 New best!')
          : h('div', { class: 'subtle' }, `Best ${store.best(mode.difficulty)}`),
        stats,
        h(
          'div',
          { class: 'menu-buttons' },
          h(
            'button',
            {
              class: 'btn btn-big btn-primary',
              onclick: () => startEndless(app, mode.difficulty, false),
            },
            'Play again',
          ),
          h(
            'button',
            { class: 'btn btn-ghost', onclick: () => app.show(difficultyScreen) },
            'Difficulty',
          ),
          h('button', { class: 'btn btn-ghost', onclick: () => app.show(homeScreen) }, 'Home'),
        ),
      ),
    };
  }

  const idx = levelIndex(mode.levelId);
  const level = LEVELS[idx];
  const won = s.status === 'won';
  const stars = won ? s.mission!.stars : 0;
  const next = LEVELS[idx + 1];
  const starEls = h(
    'div',
    { class: 'result-stars' },
    ...[1, 2, 3].map((n) =>
      h(
        'span',
        { class: `star ${n <= stars ? 'on' : ''}`, style: `animation-delay:${0.25 + n * 0.25}s` },
        '★',
      ),
    ),
  );
  const reason = s.endReason === 'outOfMoves' ? 'Out of moves!' : 'No more room!';
  const goals = h(
    'ul',
    { class: 'result-goals' },
    ...s.mission!.goals.map((g) =>
      h(
        'li',
        { class: g.progress >= g.target ? 'done' : '' },
        `${g.progress >= g.target ? '✓' : '✗'} ${goalLabel(g.spec, g.target)} (${Math.min(g.progress, g.target)}/${g.target})`,
      ),
    ),
  );
  const starHelp = h(
    'p',
    { class: 'subtle small' },
    [level.stars.two, level.stars.three]
      .map((c, i) => {
        const parts = [];
        if (c.maxMoves !== undefined) parts.push(`≤${c.maxMoves} moves`);
        if (c.minScore !== undefined) parts.push(`${c.minScore}+ pts`);
        return `${i + 2}★: ${parts.join(' or ')}`;
      })
      .join(' · '),
  );

  return {
    el: h(
      'div',
      { class: 'screen menu results' },
      h('h2', { class: 'results-title' }, won ? 'Level complete!' : reason),
      h('div', { class: 'subtle' }, `Level ${idx + 1} · ${level.name}`),
      won ? starEls : null,
      h('div', { class: 'big-score' }, String(s.score)),
      goals,
      won ? starHelp : null,
      stats,
      h(
        'div',
        { class: 'menu-buttons' },
        won && next
          ? h(
              'button',
              { class: 'btn btn-big btn-primary', onclick: () => startMission(app, next.id) },
              'Next level',
            )
          : null,
        h(
          'button',
          {
            class: `btn ${won && next ? 'btn-secondary' : 'btn-big btn-primary'}`,
            onclick: () => startMission(app, level.id),
          },
          won ? 'Replay' : 'Try again',
        ),
        h('button', { class: 'btn btn-ghost', onclick: () => app.show(levelsScreen) }, 'Levels'),
      ),
    ),
  };
}
