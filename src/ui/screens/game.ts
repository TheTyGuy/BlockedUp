/** Game screen: HUD (score, moves, goals) + the canvas BoardView + pause menu. */
import {
  createGame,
  handFits,
  previewPlacement,
  type GameEvent,
  type GameState,
  type GoalProgress,
} from '../../engine';
import { DIFFICULTIES, endlessConfig, type DifficultyId } from '../../data/difficulties';
import { LEVELS, levelConfig, levelIndex } from '../../data/levels';
import { photoUrl } from '../../data/photos';
import type { App, Screen } from '../app';
import { h } from '../dom';
import { sfx } from '../fx/audio';
import { haptics } from '../fx/haptics';
import { BoardView } from '../game/boardView';
import { GameSession } from '../game/session';
import { goalIcon, goalLabel } from '../goalText';
import { store } from '../storage';
import { BLOCK_COLORS } from '../theme';
import { difficultyScreen, homeScreen, levelsScreen } from './menus';
import { resultsScreen } from './results';

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

export function startEndless(app: App, difficulty: DifficultyId, resume: boolean): void {
  const saved = resume ? store.savedEndless(difficulty) : undefined;
  const state = saved ?? createGame(endlessConfig(difficulty), randomSeed());
  if (!saved) store.saveEndless(difficulty, state);
  app.show((a) => gameScreen(a, new GameSession(state, { kind: 'endless', difficulty })));
}

export function startMission(app: App, levelId: string): void {
  const level = LEVELS[levelIndex(levelId)];
  const state = createGame(levelConfig(level), randomSeed());
  app.show((a) => gameScreen(a, new GameSession(state, { kind: 'mission', levelId })));
}

function goalRow(g: GoalProgress): HTMLElement {
  const icon =
    g.spec.type === 'blastColor'
      ? h('span', {
          class: 'goal-swatch',
          style: `--c:${BLOCK_COLORS[g.spec.color].base}`,
        })
      : h('span', { class: 'goal-icon' }, goalIcon(g.spec));
  return h(
    'div',
    { class: 'goal' },
    icon,
    h(
      'div',
      { class: 'goal-body' },
      h('div', { class: 'goal-label' }, goalLabel(g.spec, g.target)),
      h('div', { class: 'goal-bar' }, h('div', { class: 'goal-fill' })),
    ),
    h('span', { class: 'goal-count' }),
  );
}

function updateGoalRow(row: HTMLElement, g: GoalProgress): void {
  const pct = g.target > 0 ? Math.min(1, g.progress / g.target) : 1;
  (row.querySelector('.goal-fill') as HTMLElement).style.width = `${pct * 100}%`;
  row.querySelector('.goal-count')!.textContent =
    pct >= 1 ? '✓' : `${Math.min(g.progress, g.target)}/${g.target}`;
  row.classList.toggle('complete', pct >= 1);
}

export function gameScreen(app: App, session: GameSession): Screen {
  const mode = session.mode;
  if (mode.kind === 'versus') throw new Error('Versus sessions use the versus screen');
  const level = mode.kind === 'mission' ? LEVELS[levelIndex(mode.levelId)] : null;
  const state0 = session.state;

  // --- HUD -----------------------------------------------------------------
  const scoreEl = h('div', { class: 'score' }, String(state0.score));
  const sideEl = h('div', { class: 'hud-side' });
  const comboEl = h('div', { class: 'combo-chip' });
  const pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pause' }, '❚❚');
  const title =
    mode.kind === 'endless'
      ? DIFFICULTIES[mode.difficulty].name
      : `Level ${levelIndex(mode.levelId) + 1}`;
  const hud = h(
    'div',
    { class: 'hud' },
    pauseBtn,
    h('div', { class: 'hud-center' }, h('div', { class: 'hud-title' }, title), scoreEl),
    sideEl,
  );

  const goalsEl = h('div', { class: 'goals' });
  const goalRows: HTMLElement[] = [];
  if (state0.mission) {
    for (const g of state0.mission.goals) {
      const row = goalRow(g);
      goalRows.push(row);
      goalsEl.append(row);
      updateGoalRow(row, g);
    }
  }

  const stage = h('div', { class: 'stage' });
  const el = h(
    'div',
    { class: 'screen game' },
    hud,
    comboEl,
    state0.mission ? goalsEl : null,
    stage,
  );

  // Score count-up animation.
  let shownScore = state0.score;
  let scoreRaf = 0;
  const animateScore = () => {
    const target = session.state.score;
    shownScore += Math.max(1, Math.ceil((target - shownScore) * 0.18));
    if (shownScore >= target) shownScore = target;
    scoreEl.textContent = String(shownScore);
    if (shownScore !== target) scoreRaf = requestAnimationFrame(animateScore);
    else scoreRaf = 0;
  };

  const updateSide = (s: GameState) => {
    if (s.mission?.moveLimit != null) {
      const left = s.mission.moveLimit - s.placements;
      sideEl.replaceChildren(
        h('div', { class: 'hud-small' }, 'MOVES'),
        h('div', { class: `hud-moves ${left <= 5 ? 'low' : ''}` }, String(left)),
      );
    } else if (mode.kind === 'endless') {
      const best = Math.max(store.best(mode.difficulty), s.score);
      sideEl.replaceChildren(
        h('div', { class: 'hud-small' }, 'BEST'),
        h('div', { class: 'hud-best' }, String(best)),
      );
    } else {
      sideEl.replaceChildren(
        h('div', { class: 'hud-small' }, 'PIECES'),
        h('div', { class: 'hud-best' }, String(s.placements)),
      );
    }
  };
  updateSide(state0);

  const showCombo = (combo: number) => {
    comboEl.textContent = combo >= 2 ? `🔥 Combo ×${combo}` : '';
    comboEl.classList.toggle('visible', combo >= 2);
    comboEl.classList.remove('bump');
    void comboEl.offsetWidth; // restart CSS animation
    if (combo >= 2) comboEl.classList.add('bump');
  };

  // --- Board view -----------------------------------------------------------
  // Created after the element is in the DOM (needs layout size).
  let view: BoardView | null = null;
  let endTimer = 0;
  const raf = requestAnimationFrame(() => {
    view = new BoardView(stage, session, {
      photoUrl: level?.photo ? photoUrl(level.photo) : undefined,
    });
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __view: view });
    if (level) showIntro();
  });

  const onEvents = (events: GameEvent[], s: GameState) => {
    if (events[0]?.type === 'invalidAction') return;
    if (!scoreRaf) scoreRaf = requestAnimationFrame(animateScore);
    updateSide(s);
    for (const e of events) {
      if (e.type === 'comboChanged') showCombo(e.combo);
      if (e.type === 'goalProgress') {
        const row = goalRows[e.index];
        updateGoalRow(row, s.mission!.goals[e.index]);
        row.classList.remove('bump');
        void row.offsetWidth;
        row.classList.add('bump');
      }
    }
    if (mode.kind === 'endless') store.saveEndless(mode.difficulty, s);

    if (s.status !== 'playing') {
      if (view) view.inputLocked = true;
      const won = s.status === 'won';
      let newBest = false;
      if (mode.kind === 'endless') newBest = store.submitScore(mode.difficulty, s.score);
      if (mode.kind === 'mission' && won)
        store.submitLevel(mode.levelId, s.mission!.stars, s.score);
      if (won) sfx.win();
      else {
        sfx.lose();
        haptics.gameOver();
      }
      endTimer = window.setTimeout(
        () => app.show((a) => resultsScreen(a, session, newBest)),
        // Photo levels linger so the uncovered picture can be enjoyed.
        won ? (level?.photo ? 3000 : 1700) : 1500,
      );
    }
  };
  const unsub = session.subscribe(onEvents);

  // Test hook: `?debug` in the URL exposes the session for automated play-testing.
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { __session: session, __engine: { previewPlacement, handFits } });
  }

  // --- Overlays (pause, level intro) ----------------------------------------
  let overlay: HTMLElement | null = null;
  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
    if (view && session.state.status === 'playing') view.inputLocked = false;
  };
  const openOverlay = (content: HTMLElement) => {
    view?.cancelDrag();
    if (view) view.inputLocked = true;
    overlay = h('div', { class: 'overlay' }, h('div', { class: 'panel' }, content));
    el.append(overlay);
  };

  const quit = () => {
    if (mode.kind === 'endless') app.show(difficultyScreen);
    else app.show(levelsScreen);
  };
  const restart = () => {
    if (mode.kind === 'endless') {
      store.saveEndless(mode.difficulty, undefined);
      startEndless(app, mode.difficulty, false);
    } else startMission(app, mode.levelId);
  };

  pauseBtn.addEventListener('click', () => {
    if (overlay || session.state.status !== 'playing') return;
    openOverlay(
      h(
        'div',
        { class: 'pause-menu' },
        h('h2', {}, 'Paused'),
        h('button', { class: 'btn btn-primary', onclick: closeOverlay }, 'Resume'),
        h('button', { class: 'btn btn-secondary', onclick: restart }, 'Restart'),
        h(
          'button',
          { class: 'btn btn-ghost', onclick: quit },
          mode.kind === 'endless' ? 'Quit (progress saved)' : 'Quit',
        ),
        h('button', { class: 'btn btn-ghost', onclick: () => app.show(homeScreen) }, 'Home'),
      ),
    );
  });

  function showIntro() {
    if (!level || !state0.mission) return;
    const m = state0.mission;
    openOverlay(
      h(
        'div',
        { class: 'intro' },
        h('div', { class: 'subtle' }, `Level ${levelIndex(level.id) + 1}`),
        h('h2', {}, level.name),
        level.hint ? h('p', { class: 'hint' }, level.hint) : null,
        h(
          'ul',
          { class: 'intro-goals' },
          ...m.goals.map((g) => h('li', {}, goalLabel(g.spec, g.target))),
        ),
        m.moveLimit != null ? h('p', { class: 'subtle' }, `Within ${m.moveLimit} moves`) : null,
        h('button', { class: 'btn btn-primary', onclick: closeOverlay }, 'Play'),
      ),
    );
  }

  // Pause automatically when the app is backgrounded.
  const onVisibility = () => {
    if (document.hidden && !overlay && session.state.status === 'playing') pauseBtn.click();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    el,
    destroy: () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scoreRaf);
      clearTimeout(endTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      unsub();
      view?.destroy();
    },
  };
}
