/**
 * App shell: a tiny screen router. Each screen is a function returning a root
 * element and an optional cleanup callback.
 */
import { sfx } from './fx/audio';

export interface Screen {
  el: HTMLElement;
  destroy?: () => void;
}

export type ScreenFactory = (app: App) => Screen;

export class App {
  private current: Screen | null = null;

  constructor(private root: HTMLElement) {
    // Subtle click sound for every menu button.
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) sfx.click();
    });
  }

  show(factory: ScreenFactory): void {
    this.current?.destroy?.();
    this.root.replaceChildren();
    this.current = factory(this);
    this.current.el.classList.add('screen-enter');
    this.root.appendChild(this.current.el);
  }
}
