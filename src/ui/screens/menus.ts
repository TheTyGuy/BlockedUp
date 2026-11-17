/** Menu screens: Home, Difficulty select, Level list, Settings. */
import type { App, Screen } from '../app';
import { h, starsText } from '../dom';
import { store } from '../storage';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../../data/difficulties';
import { LEVELS, WORLDS } from '../../data/levels';
import { PHOTOS, photoUrl } from '../../data/photos';
import { startEndless, startMission } from './game';
import { BLOCK_COLORS } from '../theme';
import { versusMenuScreen } from './lobby';

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
          { class: 'btn btn-versus', onclick: () => app.show(versusMenuScreen) },
          '2 Players',
          h('small', {}, 'Garbage Attack · online or same device'),
        ),
        h(
          'button',
          { class: 'btn btn-ghost', onclick: () => app.show(albumScreen) },
          'Album',
          h('small', {}, `${unlockedPhotoIds().size} of ${PHOTOS.length} photos`),
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

/**
 * A level is unlocked if it's the first, the previous level has been beaten,
 * or it has been beaten itself (so inserting or reordering levels in an update
 * never re-locks a level a player already completed).
 */
export function isUnlocked(index: number): boolean {
  const beaten = (i: number) => (store.level(LEVELS[i].id)?.stars ?? 0) > 0;
  return index === 0 || beaten(index) || beaten(index - 1);
}

export const levelsScreen = (app: App): Screen => {
  const sections: HTMLElement[] = [];
  for (const world of WORLDS) {
    const grid = h('div', { class: 'level-grid' });
    let stars = 0;
    let count = 0;
    LEVELS.forEach((level, i) => {
      if ((level.world ?? 1) !== world.id) return;
      const progress = store.level(level.id);
      const unlocked = isUnlocked(i);
      stars += progress?.stars ?? 0;
      count++;
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
    if (count === 0) continue;
    sections.push(
      h(
        'section',
        { class: 'world' },
        h(
          'div',
          { class: 'world-head' },
          h('h3', {}, `World ${world.id} · ${world.name}`),
          h('span', { class: 'world-stars' }, `★ ${stars}/${count * 3}`),
        ),
        h('p', { class: 'subtle small' }, world.blurb),
        grid,
      ),
    );
  }
  const el = h(
    'div',
    { class: 'screen menu' },
    topBar('Missions', () => app.show(homeScreen)),
    h('p', { class: 'subtle center' }, `★ ${store.totalStars()} of ${LEVELS.length * 3}`),
    ...sections,
  );
  // Open on the world the player is currently working through.
  requestAnimationFrame(() => {
    const next = el.querySelector('.level-btn:not(.locked):not(.done)');
    next?.closest('.world')?.scrollIntoView({ block: 'start' });
  });
  return { el };
};

/** Photos won on photo levels. A photo is unlocked once its level has been beaten. */
export function unlockedPhotoIds(): Set<string> {
  const ids = new Set<string>();
  for (const level of LEVELS) {
    if (level.photo && (store.level(level.id)?.stars ?? 0) > 0) ids.add(level.photo);
  }
  return ids;
}

export const albumScreen = (app: App): Screen => {
  const unlocked = unlockedPhotoIds();
  const grid = h('div', { class: 'album-grid' });
  for (const photo of PHOTOS) {
    const level = LEVELS.findIndex((l) => l.photo === photo.id);
    grid.append(
      unlocked.has(photo.id)
        ? h(
            'button',
            {
              class: 'album-item',
              'aria-label': `View ${photo.title}`,
              onclick: () => {
                const close = () => viewer.remove();
                const viewer = h(
                  'div',
                  { class: 'overlay photo-viewer', onclick: close },
                  h(
                    'figure',
                    { class: 'photo-card big' },
                    h('img', {
                      src: photoUrl(photo.id),
                      alt: photo.title,
                      width: 640,
                      height: 640,
                    }),
                    h('figcaption', {}, photo.title),
                  ),
                );
                el.append(viewer);
              },
            },
            h('img', {
              src: photoUrl(photo.id),
              alt: '',
              width: 640,
              height: 640,
              loading: 'lazy',
            }),
            h('span', {}, photo.title),
          )
        : h(
            'div',
            { class: 'album-item locked' },
            h('div', { class: 'album-mystery' }, '?'),
            h('span', {}, level >= 0 ? `Beat level ${level + 1}` : 'Coming soon'),
          ),
    );
  }
  const el = h(
    'div',
    { class: 'screen menu' },
    topBar('Album', () => app.show(homeScreen)),
    h('p', { class: 'subtle center' }, `${unlocked.size} of ${PHOTOS.length} photos uncovered`),
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
