/**
 * Two-player Garbage Attack screen, for both kinds of match:
 *  - same device (LocalMatch): two people share one phone and switch sides;
 *  - online (OnlineMatch): you play your board and can peek at the opponent's.
 *
 * One board is shown at a time; tap a player's chip (or the mini board) to
 * look at the other one. Only boards this device controls accept input.
 */
import { previewPlacement, type GameState } from '../../engine';
import type { PlayerIndex, VersusMatch } from '../../net/match';
import type { App, Screen } from '../app';
import { h } from '../dom';
import { sfx } from '../fx/audio';
import { BoardView } from '../game/boardView';
import { colorOf } from '../theme';

export interface VersusScreenOptions {
  /** Start another match (shown on the result panel). */
  onRematch: () => void;
  /** Leave to the menu. */
  onQuit: () => void;
  /** Small label under the HUD, e.g. the room code. */
  label?: string;
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

export function versusScreen(app: App, match: VersusMatch, opts: VersusScreenOptions): Screen {
  void app;
  const names = match.names;
  /** True when two people share this device (both boards are playable). */
  const shared = match.controls[0] && match.controls[1];
  const mine: PlayerIndex = match.controls[0] ? 0 : 1;
  let active: PlayerIndex = mine;
  let finished = false;
  let endTimer = 0;

  // --- HUD: one chip per player, plus a mini view of the board you're not looking at ---
  const chips = ([0, 1] as const).map((p) => {
    const score = h('span', { class: 'vs-score' }, '0');
    const sent = h('span', { class: 'vs-sent' }, 'sent 0');
    const chip = h(
      'button',
      { class: 'vs-chip', 'aria-label': `Show ${names[p]}`, onclick: () => setActive(p) },
      h('span', { class: 'vs-name' }, names[p]),
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
      'aria-label': 'Show the other board',
      onclick: () => setActive((1 - active) as PlayerIndex),
    },
    miniCanvas,
    miniLabel,
  );
  const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu' }, shared ? '❚❚' : '☰');
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
      menuBtn,
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

  function statusText(): string {
    const notice = match.notice();
    if (notice) return notice;
    if (shared) return `Playing as ${names[active]}. Clear 2+ lines or combo to attack.`;
    if (active !== mine)
      return `Watching ${names[active]}'s board. Tap "${names[mine]}" to go back.`;
    return 'Clear 2+ lines or build a combo to attack.';
  }

  function refresh(): void {
    ([0, 1] as const).forEach((p) => {
      chips[p].chip.classList.toggle('active', p === active);
      chips[p].score.textContent = String(match.sessions[p].state.score);
      chips[p].sent.textContent = `sent ${match.sent[p]}`;
      panes[p].classList.toggle('inactive', p !== active);
      const v = views[p];
      if (v) {
        const locked = finished || overlay !== null || p !== active || !match.controls[p];
        if (locked) v.cancelDrag();
        v.inputLocked = locked;
      }
    });
    const other = (1 - active) as PlayerIndex;
    drawMini(miniCanvas, match.sessions[other].state);
    miniLabel.textContent = `${names[other]} ▸`;
    status.textContent = statusText();
    status.classList.toggle('alert', match.notice() !== null);
    if (opts.label && !match.notice() && (shared || active === mine)) {
      status.textContent += ` · ${opts.label}`;
    }
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

  const checkWinner = () => {
    const winner = match.winner();
    if (winner === null || finished) return;
    finished = true;
    if (overlay) closeOverlay();
    refresh();
    if (shared || winner === mine) sfx.win();
    else sfx.lose();
    endTimer = window.setTimeout(() => showEnd(winner), 1400);
  };

  const unsubs = ([0, 1] as const).map((p) =>
    match.sessions[p].subscribe((events) => {
      refresh();
      if (events.some((e) => e.type === 'garbageReceived')) {
        bump(chips[p].chip);
        if (p !== active) bump(mini);
      }
      checkWinner();
    }),
  );
  unsubs.push(
    match.onChange(() => {
      refresh();
      checkWinner();
    }),
  );

  // --- Overlays ---------------------------------------------------------------
  let overlay: HTMLElement | null = null;
  function closeOverlay(): void {
    overlay?.remove();
    overlay = null;
    refresh();
  }
  const openOverlay = (content: HTMLElement) => {
    overlay = h('div', { class: 'overlay' }, h('div', { class: 'panel' }, content));
    el.append(overlay);
    refresh();
  };
  const quit = () => {
    match.leave();
    opts.onQuit();
  };

  menuBtn.addEventListener('click', () => {
    if (overlay || finished) return;
    openOverlay(
      shared
        ? h(
            'div',
            { class: 'pause-menu' },
            h('h2', {}, 'Paused'),
            h('button', { class: 'btn btn-primary', onclick: closeOverlay }, 'Resume'),
            h('button', { class: 'btn btn-secondary', onclick: opts.onRematch }, 'Restart match'),
            h('button', { class: 'btn btn-ghost', onclick: quit }, 'Quit'),
          )
        : h(
            'div',
            { class: 'pause-menu' },
            h('h2', {}, 'Match menu'),
            h('p', { class: 'subtle' }, 'The match keeps going while this is open.'),
            h('button', { class: 'btn btn-primary', onclick: closeOverlay }, 'Back to the match'),
            h('button', { class: 'btn btn-danger', onclick: quit }, 'Forfeit and leave'),
          ),
    );
  });

  function showEnd(winner: PlayerIndex): void {
    const loser = (1 - winner) as PlayerIndex;
    const ranOut = match.sessions[loser].state.status === 'lost';
    const title = shared ? `${names[winner]} wins!` : winner === mine ? 'You win!' : 'You lose';
    const subject = !shared && loser === mine ? 'You' : names[loser];
    const reason = ranOut ? `${subject} ran out of room.` : `${subject} left the match.`;
    const row = (p: PlayerIndex) =>
      h(
        'li',
        { class: p === winner ? 'done' : '' },
        `${names[p]}: ${match.sessions[p].state.score} pts · sent ${match.sent[p]} junk`,
      );
    openOverlay(
      h(
        'div',
        { class: 'pause-menu' },
        h('h2', {}, title),
        h('p', { class: 'subtle' }, reason),
        h('ul', { class: 'result-goals' }, row(0), row(1)),
        h(
          'button',
          { class: 'btn btn-primary', onclick: opts.onRematch },
          shared ? 'Rematch' : 'New match',
        ),
        h('button', { class: 'btn btn-ghost', onclick: opts.onQuit }, 'Done'),
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
}
