/** Optional haptics via navigator.vibrate (Android Chrome; silently ignored elsewhere). */
import { store } from '../storage';

export function vibrate(pattern: number | number[]): void {
  if (!store.settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export const haptics = {
  pickup: () => vibrate(5),
  place: () => vibrate(10),
  clear: (lines: number) => vibrate(lines >= 3 ? [25, 30, 45] : lines === 2 ? [20, 25, 30] : 25),
  gameOver: () => vibrate([40, 60, 40]),
};
