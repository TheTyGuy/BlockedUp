import './styles.css';
import { App } from './ui/app';
import { unlockAudio } from './ui/fx/audio';
import { homeScreen } from './ui/screens/menus';

// Audio can only start after a user gesture on mobile.
window.addEventListener('pointerdown', unlockAudio, { capture: true });

// Block iOS pinch-zoom / double-tap zoom gestures.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
// Double-tap zoom is disabled via `touch-action` in styles.css.

const app = new App(document.getElementById('app')!);
app.show(homeScreen);

// Offline support (production builds only, so dev hot-reload isn't cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode unavailable; game still works online */
    });
  });
}
