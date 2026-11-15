/**
 * 2 Players: choose same-device or online, create a room, or join by code.
 *
 * The Firebase SDK is loaded here with a dynamic import, so it's only
 * downloaded when someone actually goes online.
 */
import { LocalMatch } from '../../net/localMatch';
import { CODE_LENGTH, OnlineMatch, RoomError, normalizeCode } from '../../net/onlineMatch';
import type { App, Screen } from '../app';
import { h } from '../dom';
import { homeScreen } from './menus';
import { versusScreen } from './versus';

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

/** Keep the room code in the address bar so a reload rejoins the match. */
function setRoomInUrl(code: string | null): void {
  try {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState(null, '', url);
  } catch {
    // Some embedded viewers don't allow changing the URL; rejoin just won't be automatic.
  }
}

export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
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

export function startLocalMatch(app: App): void {
  app.show((a) =>
    versusScreen(a, new LocalMatch(randomSeed()), {
      onRematch: () => startLocalMatch(a),
      onQuit: () => a.show(versusMenuScreen),
    }),
  );
}

export const versusMenuScreen = (app: App): Screen => {
  const input = h('input', {
    id: 'room-code',
    class: 'code-input',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    maxlength: CODE_LENGTH,
    placeholder: 'CODE',
    'aria-label': 'Room code',
  }) as HTMLInputElement;
  const joinBtn = h('button', { class: 'btn btn-secondary', disabled: true }, 'Join');
  input.addEventListener('input', () => {
    input.value = normalizeCode(input.value);
    joinBtn.disabled = input.value.length !== CODE_LENGTH;
  });
  const join = () => {
    if (input.value.length === CODE_LENGTH) {
      app.show((a) => onlineRoomScreen(a, { join: input.value }));
    }
  };
  joinBtn.addEventListener('click', join);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') join();
  });

  return {
    el: h(
      'div',
      { class: 'screen menu' },
      topBar('2 Players', () => app.show(homeScreen)),
      h(
        'p',
        { class: 'subtle center' },
        'Garbage Attack: clear 2+ lines or build combos to send junk to your opponent.',
      ),
      h(
        'div',
        { class: 'menu-buttons' },
        h(
          'button',
          {
            class: 'btn btn-big btn-versus',
            onclick: () => app.show((a) => onlineRoomScreen(a, { create: true })),
          },
          'Create online room',
          h('small', {}, 'Play on two phones'),
        ),
        h(
          'div',
          { class: 'join-box' },
          h('label', { class: 'join-label', for: 'room-code' }, 'Have a code?'),
          h('div', { class: 'join-row' }, input, joinBtn),
        ),
        h(
          'button',
          { class: 'btn btn-ghost', onclick: () => startLocalMatch(app) },
          'Same device',
          h('small', {}, 'Share one phone and switch sides'),
        ),
      ),
    ),
  };
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(new RoomError('failed', "Couldn't reach the game server. Check your connection.")),
        ms,
      ),
    ),
  ]);

/** Connect, then create or join a room; shows the code while waiting for player 2. */
export function onlineRoomScreen(app: App, mode: { create: true } | { join: string }): Screen {
  const body = h('div', { class: 'room-panel' }, h('p', { class: 'subtle' }, 'Connecting…'));
  const el = h(
    'div',
    { class: 'screen menu' },
    topBar('Online match', () => cancel()),
    body,
  );

  let match: OnlineMatch | null = null;
  let handedOver = false;
  let gone = false;
  let unsub: (() => void) | null = null;

  function cancel(): void {
    setRoomInUrl(null);
    app.show(versusMenuScreen);
  }

  function startPlaying(m: OnlineMatch): void {
    handedOver = true;
    app.show((a) =>
      versusScreen(a, m, {
        label: `Room ${m.code}`,
        onRematch: () => {
          setRoomInUrl(null);
          a.show(versusMenuScreen);
        },
        onQuit: () => {
          setRoomInUrl(null);
          a.show(versusMenuScreen);
        },
      }),
    );
  }

  function showWaiting(m: OnlineMatch): void {
    const link = inviteLink(m.code);
    const copied = h('span', { class: 'subtle small' });
    const linkBox = h('input', {
      id: 'invite-link',
      class: 'link-input',
      type: 'text',
      readonly: true,
      'aria-label': 'Invite link',
    }) as HTMLInputElement;
    linkBox.value = link;
    const share = async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: 'Blocked Up',
            text: `Play me! Room ${m.code}`,
            url: link,
          });
          return;
        }
        await navigator.clipboard.writeText(link);
        copied.textContent = 'Link copied';
      } catch {
        // Sharing/clipboard unavailable or dismissed: select the link to copy by hand.
        linkBox.focus();
        linkBox.select();
        copied.textContent = 'Copy the link above';
      }
    };
    const notice = h('p', { class: 'subtle' }, 'Waiting for your opponent to join…');
    body.replaceChildren(
      h('p', { class: 'subtle' }, 'Room code'),
      h(
        'div',
        { class: 'room-code', 'aria-label': `Room code ${m.code.split('').join(' ')}` },
        m.code,
      ),
      h(
        'p',
        { class: 'subtle small' },
        'They tap 2 Players, then type this code. Or send the link:',
      ),
      linkBox,
      h('button', { class: 'btn btn-primary', onclick: () => void share() }, 'Share invite link'),
      copied,
      h('div', { class: 'waiting-dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      notice,
      h('button', { class: 'btn btn-ghost', onclick: cancel }, 'Cancel'),
    );
    unsub = m.onChange(() => {
      if (m.phase === 'playing') startPlaying(m);
      else notice.textContent = m.notice() ?? '';
    });
  }

  function showError(message: string): void {
    setRoomInUrl(null);
    body.replaceChildren(
      h('p', { class: 'room-error' }, message),
      h('button', { class: 'btn btn-primary', onclick: () => app.show(versusMenuScreen) }, 'Back'),
    );
  }

  void (async () => {
    try {
      const { connectFirebase } = await import('../../net/firebaseBackend');
      const backend = await withTimeout(connectFirebase(), 15000);
      const m = await withTimeout(
        'create' in mode
          ? OnlineMatch.create(backend, randomSeed())
          : OnlineMatch.join(backend, mode.join),
        15000,
      );
      if (gone) return m.destroy();
      match = m;
      setRoomInUrl(m.code);
      if (m.phase === 'playing') startPlaying(m);
      else showWaiting(m);
    } catch (e) {
      if (gone) return;
      showError(
        e instanceof RoomError
          ? e.message
          : "Couldn't connect. Check your connection and try again.",
      );
    }
  })();

  return {
    el,
    destroy: () => {
      gone = true;
      unsub?.();
      if (!handedOver) match?.destroy();
    },
  };
}
