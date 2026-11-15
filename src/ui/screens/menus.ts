/** Menu screens: Home, Difficulty select, Level list, Settings. */
import type { App, Screen } from '../app';
import { h, starsText } from '../dom';
import { store } from '../storage';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../data/difficulties';
import { LEVELS } from '../../data/levels';
import { startEndless, startMission } from './game';
import { BLOCK_COLORS } from '../theme';

function logo(): HTMLElement {
  // Little block-letter logo made of coloured squares.
  const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
  const blocks = h('div', { class: 'logo-blocks', 'aria-hidden': 'true' });
  colors.forEach((c, i) => {
    blocks.append(
      h('span', {
        class: 'logo-block',
        style: `--c:${BLOCK_COLORS[c].base};--d:${BLOCK_COLORS[c].dark};animation-delay:${i * 0.08}s`,
      }),
    );
  });
  return h('div', { class: 'logo' }, blocks, h('h1', {}, 'Blocked', h('span', {}, 'Up')));
}

function topBar(title: string, onBack: () => void): HTMLElement {
  return h(
    'div',
    { class: 'top-bar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: onBack }, '‹'),
    h('h2', {}, title),
    h('span', { class: 'icon-btn-spacer' }),
  );
}

export const homeScreen = (app: App): Screen => {
  const stars = store.totalStars();
  return {
    el: h(
      'div',
      { class: 'screen menu home' },
      logo(),
      h(
        'div',
        { class: 'menu-buttons' },
        h(
          'button',
          { class: 'btn btn-big btn-primary', onclick: () => app.show(difficultyScreen) },
          'Endless',
        ),
        h(
          'button',
          { class: 'btn btn-big btn-secondary', onclick: () => app.show(levelsScreen) },
          'Missions',
          h('small', {}, `★ ${stars} / ${LEVELS.length * 3}`),
        ),
        h(
          'button',
          { class: 'btn btn-ghost', onclick: () => app.show(settingsScreen) },
          'Settings',
        ),
      ),
    ),
  };
};

export const difficultyScreen = (app: App): Screen => {
  const list = h('div', { class: 'card-list' });
  for (const id of DIFFICULTY_ORDER) {
    const d = DIFFICULTIES[id];
    const saved = store.savedEndless(id);
    const card = h(
      'div',
      { class: `diff-card diff-${id}` },
      h(
        'button',
        { class: 'diff-main', onclick: () => startEndless(app, id, false) },
        h('span', { class: 'diff-name' }, d.name),
        h('span', { class: 'diff-blurb' }, d.blurb),
        h('span', { class: 'diff-best' }, `Best ${store.best(id)}`),
      ),
      saved
        ? h(
            'button',
            { class: 'btn btn-small btn-resume', onclick: () => startEndless(app, id, true) },
            `Resume · ${saved.score}`,
          )
        : null,
    );
    list.append(card);
  }
  return {
    el: h(
      'div',
      { class: 'screen menu' },
      topBar('Endless', () => app.show(homeScreen)),
      list,
    ),
  };
};

/** A level is unlocked if it's the first or the previous level has been beaten. */
export function isUnlocked(index: number): boolean {
  return index === 0 || (store.level(LEVELS[index - 1].id)?.stars ?? 0) > 0;
}

export const levelsScreen = (app: App): Screen => {
  const grid = h('div', { class: 'level-grid' });
  LEVELS.forEach((level, i) => {
    const progress = store.level(level.id);
    const unlocked = isUnlocked(i);
    grid.append(
      h(
        'button',
        {
          class: `level-btn ${unlocked ? '' : 'locked'} ${progress ? 'done' : ''}`,
          disabled: !unlocked,
          'aria-label': `Level ${i + 1}: ${level.name}`,
          onclick: () => startMission(app, level.id),
        },
        h('span', { class: 'level-num' }, unlocked ? String(i + 1) : '🔒'),
        h('span', { class: 'level-stars' }, starsText(progress?.stars ?? 0)),
        h('span', { class: 'level-size' }, `${level.size}×${level.size}`),
      ),
    );
  });
  const el = h(
    'div',
    { class: 'screen menu' },
    topBar('Missions', () => app.show(homeScreen)),
    h('p', { class: 'subtle center' }, `★ ${store.totalStars()} of ${LEVELS.length * 3}`),
    grid,
  );
  return { el };
};

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'setting-row' }, h('span', {}, label), input);
}

export const settingsScreen = (app: App): Screen => {
  const s = store.settings;
  // Two-tap confirmation built into the page (native confirm() dialogs are
  // blocked in some embedded/webview contexts and feel clunky on mobile).
  let armed = false;
  let disarmTimer = 0;
  const reset = h(
    'button',
    {
      class: 'btn btn-danger',
      onclick: () => {
        if (!armed) {
          armed = true;
          reset.textContent = 'Tap again to erase all progress';
          disarmTimer = window.setTimeout(() => {
            armed = false;
            reset.textContent = 'Reset progress';
          }, 4000);
          return;
        }
        clearTimeout(disarmTimer);
        armed = false;
        store.resetProgress();
        reset.textContent = 'Progress reset ✓';
      },
    },
    'Reset progress',
  );
  return {
    el: h(
      'div',
      { class: 'screen menu' },
      topBar('Settings', () => app.show(homeScreen)),
      h(
        'div',
        { class: 'settings' },
        toggle('Sound', s.sound, (v) => store.setSetting('sound', v)),
        toggle('Haptics', s.haptics, (v) => store.setSetting('haptics', v)),
        toggle('Colour patterns', s.patterns, (v) => store.setSetting('patterns', v)),
        h(
          'p',
          { class: 'subtle' },
          'Patterns add a symbol to each colour to help tell them apart.',
        ),
        reset,
      ),
    ),
  };
};
