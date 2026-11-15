/**
 * Two-player TEST screen: play both sides of a Garbage Attack match on one
 * device. One player's board is shown at a time; tap the other player's chip
 * (or their mini board) to switch sides. Used to try out and tune versus rules
 * before real phone-to-phone play exists.
 */
import { previewPlacement, type GameState } from '../../engine';
import { LocalMatch, type PlayerIndex } from '../../net/localMatch';
import type { App, Screen } from '../app';
import { h } from '../dom';
import { sfx } from '../fx/audio';
import { BoardView } from '../game/boardView';
import { colorOf } from '../theme';
import { homeScreen } from './menus';

const NAMES = ['Player 1', 'Player 2'];

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

/** Tiny read-only picture of a board, for the "other player" preview. */
function drawMini(canvas: HTMLCanvasElement, state: GameState): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = 56;
  canvas.width = canvas.height = size * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const { width, height, cells } = state.board;
  const cell = size / Math.max(width, height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const v = cells[r * width + c];
      ctx.fillStyle = v ? colorOf(v.color).base : 'rgba(255,255,255,0.08)';
      ctx.fillRect(c * cell + 0.5, r * cell + 0.5, cell - 1, cell - 1);
    }
  }
}

export const versusTestScreen = (app: App): Screen => {
  const match = new LocalMatch(randomSeed());
  let active: PlayerIndex = 0;
  let finished = false;
  let endTimer = 0;

  // --- HUD: one chip per player, plus a mini view of the side you're not playing ---
  const chips = ([0, 1] as const).map((p) => {
    const score = h('span', { class: 'vs-score' }, '0');
    const sent = h('span', { class: 'vs-sent' }, 'sent 0');
    const chip = h(
      'button',
      { class: 'vs-chip', 'aria-label': `Play as ${NAMES[p]}`, onclick: () => setActive(p) },
      h('span', { class: 'vs-name' }, NAMES[p]),
      score,
      sent,
    );
    return { chip, score, sent };
  });
  const miniCanvas = h('canvas', { class: 'vs-mini-canvas' });
  const miniLabel = h('span', { class: 'vs-mini-label' });
  const mini = h(
    'button',
    {
      class: 'vs-mini',
      'aria-label': 'Switch sides',
      onclick: () => setActive((1 - active) as PlayerIndex),
    },
    miniCanvas,
    miniLabel,
  );
  const pauseBtn = h('button', { class: 'icon-btn', 'aria-label': 'Pause' }, '❚❚');
  const status = h('div', { class: 'vs-status' });

  const stage = h('div', { class: 'stage' });
  const panes = [h('div', { class: 'versus-view' }), h('div', { class: 'versus-view' })];
  stage.append(...panes);

  const el = h(
    'div',
    { class: 'screen game versus' },
    h(
      'div',
      { class: 'hud' },
      pauseBtn,
      h('div', { class: 'vs-chips' }, chips[0].chip, chips[1].chip),
      mini,
    ),
    status,
    stage,
  );

  const views: (BoardView | null)[] = [null, null];
  const raf = requestAnimationFrame(() => {
    views[0] = new BoardView(panes[0], match.sessions[0]);
    views[1] = new BoardView(panes[1], match.sessions[1]);
    refresh();
  });

  function refresh(): void {
    ([0, 1] as const).forEach((p) => {
      chips[p].chip.classList.toggle('active', p === active);
      chips[p].score.textContent = String(match.sessions[p].state.score);
      chips[p].sent.textContent = `sent ${match.sent[p]}`;
      panes[p].classList.toggle('inactive', p !== active);
      const v = views[p];
      if (v) v.inputLocked = finished || overlay !== null || p !== active;
    });
    const other = (1 - active) as PlayerIndex;
    drawMini(miniCanvas, match.sessions[other].state);
    miniLabel.textContent = `${NAMES[other]} ▸`;
    status.textContent = `Playing as ${NAMES[active]}. Clear 2+ lines or combo to attack.`;
  }

  function setActive(p: PlayerIndex): void {
    if (p === active) return;
    views[active]?.cancelDrag();
    active = p;
    refresh();
    views[active]?.invalidate();
  }

  const bump = (node: HTMLElement) => {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  };

  const unsubs = ([0, 1] as const).map((p) =>
    match.sessions[p].subscribe((events) => {
      refresh();
      if (events.some((e) => e.type === 'garbageReceived')) {
        bump(chips[p].chip);
        if (p !== active) bump(mini);
      }
      const winner = match.winner();
      if (winner !== null && !finished) {
        finished = true;
        refresh();
        sfx.win();
        endTimer = window.setTimeout(() => showEnd(winner), 1400);
      }
    }),
  );

  // --- Overlays ---------------------------------------------------------------
  let overlay: HTMLElement | null = null;
  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
    refresh();
  };
  const openOverlay = (content: HTMLElement) => {
    views[active]?.cancelDrag();
    overlay = h('div', { class: 'overlay' }, h('div', { class: 'panel' }, content));
    el.append(overlay);
    refresh();
  };
  const rematch = () => app.show(versusTestScreen);

  pauseBtn.addEventListener('click', () => {
    if (overlay || finished) return;
    openOverlay(
      h(
        'div',
        { class: 'pause-menu' },
        h('h2', {}, 'Paused'),
        h('button', { class: 'btn btn-primary', onclick: closeOverlay }, 'Resume'),
        h('button', { class: 'btn btn-secondary', onclick: rematch }, 'Restart match'),
        h('button', { class: 'btn btn-ghost', onclick: () => app.show(homeScreen) }, 'Home'),
      ),
    );
  });

  function showEnd(winner: PlayerIndex): void {
    const row = (p: PlayerIndex) =>
      h(
        'li',
        { class: p === winner ? 'done' : '' },
        `${NAMES[p]}: ${match.sessions[p].state.score} pts · sent ${match.sent[p]} junk`,
      );
    openOverlay(
      h(
        'div',
        { class: 'pause-menu' },
        h('h2', {}, `${NAMES[winner]} wins!`),
        h('p', { class: 'subtle' }, `${NAMES[1 - winner]} ran out of room.`),
        h('ul', { class: 'result-goals' }, row(0), row(1)),
        h('button', { class: 'btn btn-primary', onclick: rematch }, 'Rematch'),
        h('button', { class: 'btn btn-ghost', onclick: () => app.show(homeScreen) }, 'Home'),
      ),
    );
  }

  // Test hook, same as the single-player game screen.
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, { __match: match, __engine: { previewPlacement } });
  }

  return {
    el,
    destroy: () => {
      cancelAnimationFrame(raf);
      clearTimeout(endTimer);
      for (const u of unsubs) u();
      match.destroy();
      for (const v of views) v?.destroy();
    },
  };
};
