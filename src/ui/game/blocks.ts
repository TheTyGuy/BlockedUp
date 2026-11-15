/**
 * Chunky bevelled block drawing, cached as sprites per (colour, size) so the
 * render loop is just a series of drawImage calls (fast on phones).
 */
import type { BlockColor, PatternId } from '../theme';

const cache = new Map<string, HTMLCanvasElement>();

export function clearBlockCache(): void {
  cache.clear();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export { roundRect };

function drawPattern(
  ctx: CanvasRenderingContext2D,
  p: PatternId,
  cx: number,
  cy: number,
  s: number,
) {
  const r = s * 0.17;
  ctx.beginPath();
  switch (p) {
    case 'dot':
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = s * 0.07;
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'triangle':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.8);
      ctx.lineTo(cx - r, cy + r * 0.8);
      ctx.closePath();
      ctx.fill();
      break;
    case 'diamond':
      ctx.moveTo(cx, cy - r * 1.1);
      ctx.lineTo(cx + r * 0.85, cy);
      ctx.lineTo(cx, cy + r * 1.1);
      ctx.lineTo(cx - r * 0.85, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case 'square':
      ctx.rect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6);
      ctx.fill();
      break;
    case 'plus':
      ctx.rect(cx - r, cy - r * 0.3, r * 2, r * 0.6);
      ctx.rect(cx - r * 0.3, cy - r, r * 0.6, r * 2);
      ctx.fill();
      break;
    case 'cross':
      ctx.lineWidth = s * 0.08;
      ctx.lineCap = 'round';
      ctx.moveTo(cx - r * 0.8, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.8);
      ctx.moveTo(cx + r * 0.8, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.8, cy + r * 0.8);
      ctx.stroke();
      break;
    case 'bars':
      ctx.rect(cx - r, cy - r * 0.65, r * 2, r * 0.45);
      ctx.rect(cx - r, cy + r * 0.2, r * 2, r * 0.45);
      ctx.fill();
      break;
    case 'stone':
      ctx.lineWidth = s * 0.05;
      ctx.lineCap = 'round';
      ctx.moveTo(cx - r * 1.4, cy - r * 0.6);
      ctx.lineTo(cx - r * 0.2, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.4, cy - r * 0.9);
      ctx.moveTo(cx - r * 0.2, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.2, cy + r * 1.2);
      ctx.moveTo(cx + r * 0.3, cy + r * 0.3);
      ctx.lineTo(cx + r * 1.3, cy + r * 0.6);
      ctx.stroke();
      break;
  }
}

/** Render one block sprite of `size` device pixels. */
function renderSprite(color: BlockColor, size: number, patterns: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const gap = Math.max(1, size * 0.045);
  const s = size - gap * 2;
  const rad = s * 0.2;

  // Bottom/dark body (gives the chunky 3D lip).
  ctx.fillStyle = color.dark;
  roundRect(ctx, gap, gap, s, s, rad);
  ctx.fill();

  // Main face, slightly raised.
  const lip = s * 0.1;
  const face = ctx.createLinearGradient(0, gap, 0, gap + s - lip);
  face.addColorStop(0, color.light);
  face.addColorStop(0.45, color.base);
  face.addColorStop(1, color.base);
  ctx.fillStyle = face;
  roundRect(ctx, gap, gap, s, s - lip, rad);
  ctx.fill();

  // Inner bevel.
  const inset = s * 0.13;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  roundRect(ctx, gap + inset, gap + inset, s - inset * 2, s - lip - inset * 2, rad * 0.6);
  ctx.stroke();

  // Glossy highlight.
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(ctx, gap + s * 0.14, gap + s * 0.08, s * 0.38, s * 0.11, s * 0.055);
  ctx.fill();

  if (patterns) {
    const isStone = color.pattern === 'stone';
    ctx.fillStyle = isStone ? 'rgba(30,34,45,0.55)' : 'rgba(0,0,0,0.22)';
    ctx.strokeStyle = ctx.fillStyle;
    drawPattern(ctx, color.pattern, gap + s / 2, gap + (s - lip) / 2 + s * 0.02, s);
  }
  return c;
}

export function blockSprite(
  color: BlockColor,
  sizePx: number,
  patterns: boolean,
): HTMLCanvasElement {
  const size = Math.max(4, Math.round(sizePx));
  const k = `${color.base}|${size}|${patterns ? 1 : 0}`;
  let sprite = cache.get(k);
  if (!sprite) {
    sprite = renderSprite(color, size, patterns);
    if (cache.size > 300) cache.clear();
    cache.set(k, sprite);
  }
  return sprite;
}

/**
 * Draw a block at CSS-pixel coordinates. `dpr` is used to pick a crisp sprite.
 */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  color: BlockColor,
  x: number,
  y: number,
  size: number,
  dpr: number,
  patterns: boolean,
): void {
  // Quantise sprite size so drag-scaling doesn't create hundreds of sprites.
  const devSize = Math.ceil((size * dpr) / 4) * 4;
  ctx.drawImage(blockSprite(color, devSize, patterns), x, y, size, size);
}
