import './styles.css';
import { App } from './ui/app';
import { unlockAudio } from './ui/fx/audio';
import { requestPersistentStorage } from './ui/storage';
import { onlineRoomScreen } from './ui/screens/lobby';
import { homeScreen } from './ui/screens/menus';

// Audio can only start after a user gesture on mobile.
window.addEventListener('pointerdown', unlockAudio, { capture: true });

// Block iOS pinch-zoom / double-tap zoom gestures.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
// Double-tap zoom is disabled via `touch-action` in styles.css.

// Keep saved progress from being cleared by the browser.
requestPersistentStorage();

const app = new App(document.getElementById('app')!);
// An invite link (…?room=CODE) goes straight to that room; so does a reload mid-match.
const room = new URLSearchParams(location.search).get('room');
if (room) app.show((a) => onlineRoomScreen(a, { join: room }));
else app.show(homeScreen);

// Offline support (production builds only, so dev hot-reload isn't cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode unavailable; game still works online */
    });
  });
}
