/**
 * BoardView: canvas rendering + touch input for the board and hand tray.
 *
 * It reads state from the GameSession, asks the engine (pure queries) whether
 * a placement is valid / which lines it would clear, and dispatches a `place`
 * action on drop. All animation is driven by engine events.
 */
import {
  getShape,
  handFits,
  previewPlacement,
  type GameEvent,
  type GameState,
  type HandPiece,
  type PlacementPreview,
} from '../../engine';
import { colorOf, type BlockColor } from '../theme';
import { clearBlockCache, drawBlock, roundRect } from './blocks';
import type { GameSession } from './session';
import { sfx } from '../fx/audio';
import { haptics } from '../fx/haptics';
import { store } from '../storage';

// --- small math helpers -----------------------------------------------------
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Cover-tile colours (the slabs hiding a photo). */
const COVER_COLOR: BlockColor = {
  name: 'Cover',
  base: '#4b4196',
  light: '#6f64c4',
  dark: '#2c2566',
  pattern: 'stone',
};
const COVER_HIT_MS = 420;

const FONT = `ui-rounded, "SF Pro Rounded", "Nunito", "Arial Rounded MT Bold", system-ui, sans-serif`;

interface Layout {
  w: number;
  h: number;
  cell: number;
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  trayY: number;
  trayH: number;
  trayCell: number;
}

interface DragState {
  handIndex: number;
  piece: HandPiece;
  pointerId: number;
  touch: boolean;
  px: number;
  py: number;
  start: number;
  /** Top-left of the piece in the tray when picked up (for the lift animation). */
  fromX: number;
  fromY: number;
  snap: { row: number; col: number } | null;
  preview: PlacementPreview | null;
}

interface ReturnAnim {
  handIndex: number;
  piece: HandPiece;
  fromX: number;
  fromY: number;
  fromCell: number;
  start: number;
}

interface Pop {
  row: number;
  col: number;
  color: BlockColor;
  start: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  start: number;
  life: number;
  rot: number;
  vr: number;
}

interface TextPopup {
  text: string;
  x: number;
  y: number;
  start: number;
  life: number;
  size: number;
  color: string;
}

const RETURN_MS = 220;
const LIFT_MS = 110;
const POP_MS = 420;
const PLACE_MS = 200;
const DEAL_MS = 320;

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private L: Layout = {
    w: 0,
    h: 0,
    cell: 0,
    boardX: 0,
    boardY: 0,
    boardW: 0,
    boardH: 0,
    trayY: 0,
    trayH: 0,
    trayCell: 0,
  };
  private raf = 0;
  private resizeObs: ResizeObserver;
  private unsub: () => void;

  private fits: boolean[] = [];
  private drag: DragState | null = null;
  private returns: ReturnAnim[] = [];
  private pops: Pop[] = [];
  private particles: Particle[] = [];
  private texts: TextPopup[] = [];
  private placed = new Map<number, number>(); // cell index -> anim start
  private dealStart = -1e9;
  private shake = { start: -1e9, dur: 0, mag: 0 };
  private endStart = -1;
  private photo: HTMLImageElement | null = null;
  /** Cover tiles that were just hit: cell index -> when (for the crack flash). */
  private coverHits = new Map<number, number>();
  private wonStart = -1;

  /** When true, input is ignored (pause menu / end of game). */
  inputLocked = false;

  constructor(
    private container: HTMLElement,
    private session: GameSession,
    opts: { photoUrl?: string } = {},
  ) {
    if (opts.photoUrl) {
      // The photo hidden under this level's cover tiles.
      const img = new Image();
      img.onload = () => {
        this.photo = img;
        this.invalidate();
      };
      img.src = opts.photoUrl;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);

    this.fits = handFits(session.state);
    this.dealStart = performance.now();

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointercancel', this.onCancel);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();

    this.unsub = session.subscribe((events, state) => this.onEvents(events, state));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.unsub();
    this.canvas.remove();
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return; // hidden or not laid out yet
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const { width: cols, height: rows } = this.session.state.board;
    const pad = Math.max(10, Math.min(w, h) * 0.03);
    const trayMin = Math.max(110, h * 0.24);
    const side = Math.min(w - pad * 2, h - trayMin - pad * 2, 560);
    const cell = Math.floor(side / Math.max(cols, rows));
    const boardW = cell * cols;
    const boardH = cell * rows;
    const boardX = Math.round((w - boardW) / 2);
    const spare = h - trayMin - pad * 2 - boardH;
    const boardY = Math.round(pad + Math.max(0, spare) * 0.35);
    const trayY = boardY + boardH + pad;
    const trayH = h - trayY - pad * 0.5;
    const trayCell = Math.max(8, Math.min(cell * 0.62, (w / 3 - 10) / 5, (trayH - 10) / 5, 32));
    this.L = { w, h, cell, boardX, boardY, boardW, boardH, trayY, trayH, trayCell };
    clearBlockCache();
    this.invalidate();
  }

  /** Top-left of a hand piece when resting in its tray slot. */
  private trayPos(i: number, piece: HandPiece): { x: number; y: number } {
    const shape = getShape(piece.shapeId);
    const n = this.session.state.hand.length;
    const cx = (this.L.w * (2 * i + 1)) / (2 * n);
    const cy = this.L.trayY + this.L.trayH / 2;
    return {
      x: cx - (shape.width * this.L.trayCell) / 2,
      y: cy - (shape.height * this.L.trayCell) / 2,
    };
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (this.inputLocked || this.drag || this.session.state.status !== 'playing') return;
    const { x, y } = this.local(e);
    if (y < this.L.trayY - this.L.cell * 0.6) return;
    const n = this.session.state.hand.length;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x / this.L.w) * n)));
    const piece = this.session.state.hand[i];
    if (!piece || this.returns.some((r) => r.handIndex === i)) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const from = this.trayPos(i, piece);
    this.drag = {
      handIndex: i,
      piece,
      pointerId: e.pointerId,
      touch: e.pointerType !== 'mouse',
      px: x,
      py: y,
      start: performance.now(),
      fromX: from.x,
      fromY: from.y,
      snap: null,
      preview: null,
    };
    this.updateSnap();
    sfx.pickup();
    haptics.pickup();
    this.invalidate();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    e.preventDefault();
    const { x, y } = this.local(e);
    this.drag.px = x;
    this.drag.py = y;
    this.updateSnap();
    this.invalidate();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    if (d.snap && d.preview?.valid && !this.inputLocked) {
      const events = this.session.dispatch({
        type: 'place',
        handIndex: d.handIndex,
        row: d.snap.row,
        col: d.snap.col,
      });
      if (events[0]?.type !== 'invalidAction') return;
    }
    this.returnPiece(d);
  };

  private onCancel = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    this.returnPiece(d);
  };

  /** Cancel any drag in progress (e.g. when pausing). */
  cancelDrag(): void {
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      this.returnPiece(d);
    }
  }

  private returnPiece(d: DragState): void {
    const pos = this.dragPos(d, performance.now());
    this.returns.push({
      handIndex: d.handIndex,
      piece: d.piece,
      fromX: pos.x,
      fromY: pos.y,
      fromCell: pos.cell,
      start: performance.now(),
    });
    if (d.snap) sfx.invalid();
    this.invalidate();
  }

  /** Where the dragged piece is drawn: lifted above the finger, scaled to board size. */
  private dragTarget(d: DragState): { x: number; y: number } {
    const shape = getShape(d.piece.shapeId);
    const { cell } = this.L;
    const pw = shape.width * cell;
    const ph = shape.height * cell;
    // Touch: keep the piece fully above the fingertip. Mouse: centre on cursor.
    const lift = d.touch ? Math.max(cell * 1.1, 44) : 0;
    return { x: d.px - pw / 2, y: d.touch ? d.py - lift - ph : d.py - ph / 2 };
  }

  private dragPos(d: DragState, now: number): { x: number; y: number; cell: number } {
    const t = easeOutCubic(clamp01((now - d.start) / LIFT_MS));
    const target = this.dragTarget(d);
    return {
      x: lerp(d.fromX, target.x, t),
      y: lerp(d.fromY, target.y, t),
      cell: lerp(this.L.trayCell, this.L.cell, t),
    };
  }

  /** Snap the dragged piece to the nearest valid grid position (with a little tolerance). */
  private updateSnap(): void {
    const d = this.drag!;
    const state = this.session.state;
    const shape = getShape(d.piece.shapeId);
    const { cell, boardX, boardY } = this.L;
    const target = this.dragTarget(d);
    const fr = (target.y - boardY) / cell;
    const fc = (target.x - boardX) / cell;
    const maxR = state.board.height - shape.height;
    const maxC = state.board.width - shape.width;

    const candidates: { row: number; col: number; dist: number }[] = [];
    for (const row of new Set([Math.round(fr), Math.floor(fr), Math.ceil(fr)])) {
      for (const col of new Set([Math.round(fc), Math.floor(fc), Math.ceil(fc)])) {
        if (row < 0 || col < 0 || row > maxR || col > maxC) continue;
        candidates.push({ row, col, dist: Math.hypot(row - fr, col - fc) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);

    d.snap = null;
    d.preview = null;
    for (const c of candidates) {
      if (c.dist > 0.85) break;
      const p = previewPlacement(state, d.handIndex, c.row, c.col);
      if (p.valid) {
        d.snap = c;
        d.preview = p;
        return;
      }
    }
    // Nothing valid nearby: show an invalid ghost at the nearest in-bounds spot.
    const nearest = candidates[0];
    if (nearest && nearest.dist < 0.6) {
      d.snap = nearest;
      d.preview = previewPlacement(state, d.handIndex, nearest.row, nearest.col);
    }
  }

  // ---------------------------------------------------------------------------
  // Engine events -> effects
  // ---------------------------------------------------------------------------

  private onEvents(events: GameEvent[], state: GameState): void {
    const now = performance.now();
    const { cell, boardX, boardY } = this.L;
    let center = { x: this.L.w / 2, y: boardY + this.L.boardH / 2 };
    let scoreDelta = 0;
    let lines = 0;

    for (const e of events) {
      switch (e.type) {
        case 'piecePlaced': {
          for (const p of e.cells) this.placed.set(p.row * state.board.width + p.col, now);
          const avgR = e.cells.reduce((s, p) => s + p.row, 0) / e.cells.length;
          const avgC = e.cells.reduce((s, p) => s + p.col, 0) / e.cells.length;
          center = { x: boardX + (avgC + 0.5) * cell, y: boardY + (avgR + 0.5) * cell };
          sfx.place();
          haptics.place();
          break;
        }
        case 'linesCleared': {
          lines = e.lines;
          const cr = (center.y - boardY) / cell;
          const cc = (center.x - boardX) / cell;
          for (const c of e.cells) {
            const delay = Math.hypot(c.row - cr, c.col - cc) * 28;
            const color = colorOf(c.cell.color);
            this.pops.push({ row: c.row, col: c.col, color, start: now + delay });
            this.spawnParticles(c.row, c.col, color, now + delay, e.lines);
          }
          sfx.clear(e.lines, e.combo);
          haptics.clear(e.lines);
          if (e.lines >= 3)
            this.shake = { start: now, dur: 380, mag: Math.min(4 + e.lines * 2, 14) };
          else if (e.lines === 2) this.shake = { start: now, dur: 220, mag: 3 };
          const label = ['', '', 'Double!', 'Triple!', 'Quad!', 'Amazing!', 'Incredible!'];
          if (e.lines >= 2) {
            this.addText(
              label[Math.min(e.lines, 6)],
              this.L.w / 2,
              boardY + this.L.boardH * 0.38,
              34,
              '#fff',
              1100,
            );
          }
          break;
        }
        case 'coverDamaged': {
          let broke = 0;
          for (const c of e.cells) {
            const delay =
              Math.hypot(c.row - (center.y - boardY) / cell, c.col - (center.x - boardX) / cell) *
              28;
            this.coverHits.set(c.row * state.board.width + c.col, now + delay);
            if (c.layers === 0) {
              broke++;
              this.spawnParticles(c.row, c.col, COVER_COLOR, now + delay, 1);
            }
          }
          if (broke > 0) haptics.place();
          break;
        }
        case 'boardCleared':
          this.addText(
            'ALL CLEAR!',
            this.L.w / 2,
            boardY + this.L.boardH * 0.5,
            40,
            '#ffe66b',
            1500,
          );
          break;
        case 'comboChanged':
          if (e.combo >= 2) {
            this.addText(
              `Combo ×${e.combo}`,
              this.L.w / 2,
              boardY + this.L.boardH * 0.62,
              30,
              '#ffb347',
              1100,
            );
            sfx.combo(e.combo);
          }
          break;
        case 'scoreChanged':
          scoreDelta = e.delta;
          break;
        case 'handDealt':
          this.dealStart = now + 120;
          setTimeout(() => sfx.deal(), 120);
          break;
        case 'gameOver':
          this.endStart = now + 350;
          break;
        case 'gameWon':
          this.wonStart = now + 200;
          this.spawnConfetti(now + 200);
          break;
        case 'garbageSent':
          this.addText(
            `Attack! ${e.cells} junk`,
            this.L.w / 2,
            boardY + this.L.boardH * 0.2,
            26,
            '#ff8a96',
            1200,
          );
          break;
        case 'garbageReceived':
          // Junk from the opponent: stones thud into empty cells, and/or
          // existing blocks get smashed off the board.
          if (e.cells.length + e.smashed.length === 0) break;
          for (const p of e.cells) this.placed.set(p.row * state.board.width + p.col, now);
          e.smashed.forEach((c, i) => {
            const color = colorOf(c.cell.color);
            this.pops.push({ row: c.row, col: c.col, color, start: now + i * 70 });
            this.spawnParticles(c.row, c.col, color, now + i * 70, 3);
          });
          this.shake = {
            start: now,
            dur: 300,
            mag: Math.min(3 + e.cells.length + e.smashed.length, 10),
          };
          if (e.cells.length > 0) {
            this.addText(
              `+${e.cells.length} junk!`,
              this.L.w / 2,
              boardY + this.L.boardH * 0.42,
              30,
              '#c9cfdb',
              1100,
            );
          }
          if (e.smashed.length > 0) {
            this.addText(
              `${e.smashed.length} smashed!`,
              this.L.w / 2,
              boardY + this.L.boardH * 0.58,
              30,
              '#ff8a96',
              1100,
            );
          }
          sfx.garbage();
          haptics.clear(2);
          break;
        default:
          break;
      }
    }
    if (scoreDelta > 0) {
      this.addText(
        `+${scoreDelta}`,
        center.x,
        center.y,
        lines > 0 ? 28 : 20,
        lines > 0 ? '#fff6b0' : '#ffffff',
        800,
      );
    }
    this.fits = handFits(state);
    // The board may have changed under a piece that's being dragged (incoming junk).
    if (this.drag) this.updateSnap();
    this.invalidate();
  }

  private addText(text: string, x: number, y: number, size: number, color: string, life: number) {
    this.texts.push({ text, x, y, size, color, life, start: performance.now() });
  }

  private spawnParticles(
    row: number,
    col: number,
    color: BlockColor,
    start: number,
    lines: number,
  ) {
    const { cell, boardX, boardY } = this.L;
    const cx = boardX + (col + 0.5) * cell;
    const cy = boardY + (row + 0.5) * cell;
    const n = lines >= 3 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 260) * (cell / 40);
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 180 * (cell / 40),
        size: cell * (0.16 + Math.random() * 0.16),
        color: Math.random() < 0.3 ? color.light : color.base,
        start,
        life: 550 + Math.random() * 300,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  private spawnConfetti(start: number) {
    const colors = ['#ff4d5e', '#ffd23f', '#2fd27a', '#3d7bff', '#a35cf0', '#ff9a1f'];
    for (let i = 0; i < 90; i++) {
      this.particles.push({
        x: this.L.w * Math.random(),
        y: -10 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 120,
        vy: 60 + Math.random() * 160,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        start: start + Math.random() * 400,
        life: 1600 + Math.random() * 800,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  invalidate(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = () => {
    this.raf = 0;
    const now = performance.now();
    const busy = this.render(now);
    if (busy) this.invalidate();
  };

  /** Draw a frame. Returns true while anything is still animating. */
  private render(now: number): boolean {
    const { ctx, dpr, L } = this;
    const state = this.session.state;
    const patterns = store.settings.patterns;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);

    let busy = !!this.drag;
    const st = (now - this.shake.start) / this.shake.dur;
    if (st >= 0 && st < 1) {
      busy = true;
      const m = this.shake.mag * (1 - st);
      ctx.translate(Math.sin(st * 47) * m, Math.cos(st * 39) * m * 0.6);
    }

    this.drawBoardBackground();

    // Line-clear preview highlight + cells recoloured to the dragged piece's colour.
    const d = this.drag;
    const preview = d?.preview?.valid ? d.preview : null;
    const clearSet = new Set<number>();
    if (preview && d) {
      const pulse = 0.55 + 0.25 * Math.sin(now / 110);
      ctx.fillStyle = `rgba(255,255,255,${0.1 * pulse})`;
      for (const r of preview.rows) {
        for (let c = 0; c < state.board.width; c++) clearSet.add(r * state.board.width + c);
        ctx.fillRect(L.boardX, L.boardY + r * L.cell, L.boardW, L.cell);
      }
      for (const c of preview.cols) {
        for (let r = 0; r < state.board.height; r++) clearSet.add(r * state.board.width + c);
        ctx.fillRect(L.boardX + c * L.cell, L.boardY, L.cell, L.boardH);
      }
    }

    // Placed cells.
    const pieceColor = d ? colorOf(d.piece.color) : null;
    const endT = this.endStart >= 0 ? now - this.endStart : -1;
    for (let r = 0; r < state.board.height; r++) {
      for (let c = 0; c < state.board.width; c++) {
        const i = r * state.board.width + c;
        const cell = state.board.cells[i];
        if (!cell) continue;
        let size = L.cell;
        const ps = this.placed.get(i);
        if (ps !== undefined) {
          const t = clamp01((now - ps) / PLACE_MS);
          if (t >= 1) this.placed.delete(i);
          else {
            busy = true;
            size = L.cell * (0.82 + 0.18 * easeOutBack(t));
          }
        }
        const color = clearSet.has(i) && pieceColor ? pieceColor : colorOf(cell.color);
        const x = L.boardX + c * L.cell + (L.cell - size) / 2;
        const y = L.boardY + r * L.cell + (L.cell - size) / 2;
        drawBlock(ctx, color, x, y, size, dpr, patterns);
        if (clearSet.has(i)) {
          ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(now / 110)})`;
          roundRect(ctx, x + 2, y + 2, size - 4, size - 4, size * 0.18);
          ctx.fill();
        }
        if (endT >= 0) {
          const t = clamp01((endT - (state.board.height - 1 - r) * 55) / 260);
          if (t < 1) busy = true;
          ctx.fillStyle = `rgba(16,12,40,${0.6 * t})`;
          ctx.fillRect(L.boardX + c * L.cell, L.boardY + r * L.cell, L.cell, L.cell);
        }
      }
    }
    if (preview && d) busy = true; // keep the highlight pulsing

    // Ghost preview.
    if (d?.snap && d.preview) {
      const color = colorOf(d.piece.color);
      for (const p of d.preview.cells) {
        const x = L.boardX + p.col * L.cell;
        const y = L.boardY + p.row * L.cell;
        if (d.preview.valid) {
          ctx.globalAlpha = 0.42;
          drawBlock(ctx, color, x, y, L.cell, dpr, patterns);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = 'rgba(255,60,80,0.32)';
          roundRect(ctx, x + 3, y + 3, L.cell - 6, L.cell - 6, L.cell * 0.2);
          ctx.fill();
        }
      }
    }

    busy = this.drawPops(now) || busy;
    busy = this.drawTray(now) || busy;

    // Dragged piece on top.
    if (d) {
      const pos = this.dragPos(d, now);
      this.drawPiece(d.piece, pos.x, pos.y, pos.cell, 1, patterns);
    }

    busy = this.drawParticles(now) || busy;
    busy = this.drawTexts(now) || busy;
    if (this.coverHits.size > 0) busy = true;
    if (this.wonStart >= 0 && now - this.wonStart < 3000) busy = true;
    // Level won: the blocks fade away to show the whole photo.
    if (this.photo && this.wonStart >= 0 && now >= this.wonStart) {
      const a = easeOutCubic(clamp01((now - this.wonStart) / 700));
      ctx.save();
      ctx.globalAlpha = a;
      roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardH, L.cell * 0.2);
      ctx.clip();
      ctx.drawImage(this.photo, L.boardX, L.boardY, L.boardW, L.boardH);
      ctx.restore();
    }
    return busy;
  }

  private drawBoardBackground(): void {
    const { ctx, L } = this;
    const state = this.session.state;
    const pad = Math.max(4, L.cell * 0.12);
    ctx.fillStyle = 'rgba(8,6,30,0.55)';
    roundRect(
      ctx,
      L.boardX - pad,
      L.boardY - pad,
      L.boardW + pad * 2,
      L.boardH + pad * 2,
      pad * 1.6,
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
    const g = Math.max(1, L.cell * 0.05);
    const cover = state.cover;
    const startCover = state.config.cover;
    const photo = this.photo;
    const now = performance.now();
    for (let r = 0; r < state.board.height; r++) {
      for (let c = 0; c < state.board.width; c++) {
        const i = r * state.board.width + c;
        const x = L.boardX + c * L.cell;
        const y = L.boardY + r * L.cell;
        const layers = cover?.[i] ?? 0;
        const showPhoto = photo !== null && cover !== undefined;

        if (showPhoto && layers === 0) {
          // This cell's slice of the photo, visible once its tile has broken.
          const sw = photo.naturalWidth / state.board.width;
          const sh = photo.naturalHeight / state.board.height;
          ctx.drawImage(photo, c * sw, r * sh, sw, sh, x + 0.5, y + 0.5, L.cell - 1, L.cell - 1);
          // Slightly dimmed while playing so blocks stand out; full brightness on the win.
          ctx.fillStyle = 'rgba(12,8,40,0.24)';
          ctx.fillRect(x + 0.5, y + 0.5, L.cell - 1, L.cell - 1);
        } else if (!cover || layers === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.055)';
          roundRect(ctx, x + g, y + g, L.cell - 2 * g, L.cell - 2 * g, L.cell * 0.16);
          ctx.fill();
        }

        // A tile only looks cracked once it has actually been hit.
        if (layers > 0) {
          this.drawCoverTile(x, y, (startCover?.[i] ?? layers) - layers, layers, i);
        }

        const hit = this.coverHits.get(i);
        if (hit !== undefined) {
          const t = (now - hit) / COVER_HIT_MS;
          if (t >= 1) this.coverHits.delete(i);
          else if (t >= 0) {
            ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
            ctx.fillRect(x, y, L.cell, L.cell);
          }
        }
      }
    }
  }

  /** A cover slab. Always opaque, so nothing underneath shows until it breaks. */
  private drawCoverTile(x: number, y: number, hits: number, layers: number, index: number): void {
    const cracked = hits > 0;
    const { ctx, L } = this;
    const s = L.cell;
    const g = Math.max(0.5, s * 0.03);
    ctx.fillStyle = COVER_COLOR.dark;
    roundRect(ctx, x + g, y + g, s - 2 * g, s - 2 * g, s * 0.14);
    ctx.fill();
    ctx.fillStyle = cracked ? COVER_COLOR.base : COVER_COLOR.light;
    roundRect(ctx, x + g, y + g, s - 2 * g, s - 2 * g - s * 0.07, s * 0.14);
    ctx.fill();
    if (!cracked) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, x + s * 0.16, y + s * 0.12, s * 0.34, s * 0.09, s * 0.045);
      ctx.fill();
      // Thick tiles get one inner frame per extra clear they need, so they can be planned around.
      ctx.strokeStyle = 'rgba(28,20,80,0.55)';
      ctx.lineWidth = Math.max(1, s * 0.05);
      for (let f = 0; f < Math.min(layers - 1, 2); f++) {
        const inset = s * (0.2 + f * 0.12);
        roundRect(ctx, x + inset, y + inset, s - 2 * inset, s * 0.93 - 2 * inset, s * 0.1);
        ctx.stroke();
      }
      return;
    }
    // Crack lines, varied per cell but stable from frame to frame.
    const k = (n: number) => (((index + 1) * 9301 + n * 49297) % 233280) / 233280;
    const cx = x + s * (0.4 + 0.2 * k(1));
    const cy = y + s * (0.4 + 0.2 * k(2));
    ctx.strokeStyle = 'rgba(20,14,60,0.8)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    // More cracks the closer the tile is to breaking.
    const lines = layers === 1 ? 5 : 3;
    for (let a = 0; a < lines; a++) {
      const ang = (a / lines) * Math.PI * 2 + k(3 + a) * 1.2;
      const len = s * (0.3 + 0.16 * k(7 + a));
      const mx = cx + Math.cos(ang) * len * 0.5 + (k(11 + a) - 0.5) * s * 0.12;
      const my = cy + Math.sin(ang) * len * 0.5 + (k(15 + a) - 0.5) * s * 0.12;
      ctx.moveTo(cx, cy);
      ctx.lineTo(mx, my);
      ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    }
    ctx.stroke();
  }

  private drawPiece(
    piece: HandPiece,
    x: number,
    y: number,
    cell: number,
    alpha: number,
    patterns: boolean,
  ) {
    const shape = getShape(piece.shapeId);
    const color = colorOf(piece.color);
    this.ctx.globalAlpha = alpha;
    for (const c of shape.cells) {
      drawBlock(this.ctx, color, x + c.col * cell, y + c.row * cell, cell, this.dpr, patterns);
    }
    this.ctx.globalAlpha = 1;
  }

  private drawTray(now: number): boolean {
    const state = this.session.state;
    const patterns = store.settings.patterns;
    let busy = false;
    state.hand.forEach((piece, i) => {
      if (!piece) return;
      if (this.drag?.handIndex === i) return;
      const ret = this.returns.find((r) => r.handIndex === i);
      const home = this.trayPos(i, piece);
      const restAlpha = this.fits[i] !== false ? 1 : 0.28;
      if (ret) {
        const t = easeOutCubic(clamp01((now - ret.start) / RETURN_MS));
        busy = true;
        this.drawPiece(
          piece,
          lerp(ret.fromX, home.x, t),
          lerp(ret.fromY, home.y, t),
          lerp(ret.fromCell, this.L.trayCell, t),
          lerp(1, restAlpha, t),
          patterns,
        );
        return;
      }
      // Deal-in: slide from the right with a small stagger.
      const dt = clamp01((now - this.dealStart - i * 70) / DEAL_MS);
      if (dt < 1) busy = true;
      const off = (1 - easeOutBack(dt)) * this.L.w * 0.7;
      this.drawPiece(piece, home.x + off, home.y, this.L.trayCell, restAlpha, patterns);
    });
    const before = this.returns.length;
    this.returns = this.returns.filter((r) => now - r.start < RETURN_MS);
    if (this.returns.length !== before) busy = true;
    return busy;
  }

  private drawPops(now: number): boolean {
    const { ctx, L } = this;
    const patterns = store.settings.patterns;
    this.pops = this.pops.filter((p) => now - p.start < POP_MS);
    for (const p of this.pops) {
      const t = (now - p.start) / POP_MS;
      const x0 = L.boardX + p.col * L.cell;
      const y0 = L.boardY + p.row * L.cell;
      if (t < 0) {
        // Not started yet: the block is still sitting there.
        drawBlock(ctx, p.color, x0, y0, L.cell, this.dpr, patterns);
        continue;
      }
      const scale = t < 0.25 ? 1 + 0.25 * (t / 0.25) : 1.25 * (1 - easeOutCubic((t - 0.25) / 0.75));
      const size = L.cell * scale;
      ctx.globalAlpha = 1 - clamp01((t - 0.55) / 0.45);
      drawBlock(
        ctx,
        p.color,
        x0 + (L.cell - size) / 2,
        y0 + (L.cell - size) / 2,
        size,
        this.dpr,
        patterns,
      );
      if (t < 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - t / 0.3)})`;
        roundRect(ctx, x0 + (L.cell - size) / 2, y0 + (L.cell - size) / 2, size, size, size * 0.2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    return this.pops.length > 0;
  }

  private drawParticles(now: number): boolean {
    const { ctx } = this;
    this.particles = this.particles.filter((p) => now - p.start < p.life);
    for (const p of this.particles) {
      const t = (now - p.start) / 1000;
      if (t < 0) continue;
      const x = p.x + p.vx * t;
      const y = p.y + p.vy * t + 0.5 * 900 * t * t;
      ctx.save();
      ctx.globalAlpha = 1 - clamp01((now - p.start) / p.life);
      ctx.translate(x, y);
      ctx.rotate(p.rot + p.vr * t);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    return this.particles.length > 0;
  }

  private drawTexts(now: number): boolean {
    const { ctx } = this;
    this.texts = this.texts.filter((p) => now - p.start < p.life);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.texts) {
      const t = (now - p.start) / p.life;
      const pop = easeOutBack(clamp01(t / 0.2));
      const size = p.size * (0.6 + 0.4 * pop) * Math.min(1, this.L.w / 380 + 0.2);
      ctx.globalAlpha = 1 - clamp01((t - 0.65) / 0.35);
      ctx.font = `900 ${size}px ${FONT}`;
      const y = p.y - 46 * easeOutCubic(t);
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = 'rgba(30,10,60,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
      ctx.globalAlpha = 1;
    }
    return this.texts.length > 0;
  }
}
