/**
 * Piece catalog.
 *
 * Each base shape is drawn as ASCII art and expanded into all of its distinct
 * orientations (pieces never rotate during play — each orientation is simply a
 * different piece the generator can deal). Shape ids are stable strings like
 * "L4-3", so they are safe to store in saved games and send over the network.
 */
import type { PieceCategory, Point } from './types';

export interface PieceShape {
  id: string;
  category: PieceCategory;
  /** Cell offsets relative to the shape's top-left corner. */
  cells: Point[];
  width: number;
  height: number;
}

type Orientations = 'fixed' | 'rotate' | 'rotateMirror';

interface BaseShape {
  prefix: string;
  category: PieceCategory;
  art: string[];
  orientations: Orientations;
}

/** Edit this list to add/remove pieces. '#' = filled, '.' = empty. */
const BASE_SHAPES: BaseShape[] = [
  { prefix: 'dot', category: 'single', art: ['#'], orientations: 'fixed' },
  { prefix: 'I2', category: 'line2', art: ['##'], orientations: 'rotate' },
  { prefix: 'I3', category: 'line3', art: ['###'], orientations: 'rotate' },
  { prefix: 'I4', category: 'line4', art: ['####'], orientations: 'rotate' },
  { prefix: 'I5', category: 'line5', art: ['#####'], orientations: 'rotate' },
  { prefix: 'O2', category: 'square2', art: ['##', '##'], orientations: 'fixed' },
  { prefix: 'O3', category: 'square3', art: ['###', '###', '###'], orientations: 'fixed' },
  { prefix: 'R23', category: 'rect', art: ['###', '###'], orientations: 'rotate' },
  { prefix: 'L3', category: 'smallL', art: ['#.', '##'], orientations: 'rotate' },
  { prefix: 'L4', category: 'L', art: ['#.', '#.', '##'], orientations: 'rotateMirror' },
  { prefix: 'L5', category: 'bigL', art: ['#..', '#..', '###'], orientations: 'rotate' },
  { prefix: 'T4', category: 'T', art: ['###', '.#.'], orientations: 'rotate' },
  { prefix: 'SZ', category: 'SZ', art: ['.##', '##.'], orientations: 'rotateMirror' },
];

function parseArt(art: string[]): Point[] {
  const cells: Point[] = [];
  art.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === '#') cells.push({ row, col });
    });
  });
  return cells;
}

/** Shift cells so the minimum row/col is 0 and sort them for canonical comparison. */
function normalize(cells: Point[]): Point[] {
  const minR = Math.min(...cells.map((c) => c.row));
  const minC = Math.min(...cells.map((c) => c.col));
  return cells
    .map((c) => ({ row: c.row - minR, col: c.col - minC }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

const rotate90 = (cells: Point[]): Point[] =>
  normalize(cells.map((c) => ({ row: c.col, col: -c.row })));
const mirror = (cells: Point[]): Point[] =>
  normalize(cells.map((c) => ({ row: c.row, col: -c.col })));
const key = (cells: Point[]): string => cells.map((c) => `${c.row},${c.col}`).join(';');

function orientationsOf(base: BaseShape): Point[][] {
  const start = normalize(parseArt(base.art));
  const candidates: Point[][] = [start];
  if (base.orientations !== 'fixed') {
    let cur = start;
    for (let i = 0; i < 3; i++) candidates.push((cur = rotate90(cur)));
  }
  if (base.orientations === 'rotateMirror') {
    let cur = mirror(start);
    candidates.push(cur);
    for (let i = 0; i < 3; i++) candidates.push((cur = rotate90(cur)));
  }
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const k = key(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildCatalog(): PieceShape[] {
  const out: PieceShape[] = [];
  for (const base of BASE_SHAPES) {
    orientationsOf(base).forEach((cells, i) => {
      out.push({
        id: `${base.prefix}-${i}`,
        category: base.category,
        cells,
        width: Math.max(...cells.map((c) => c.col)) + 1,
        height: Math.max(...cells.map((c) => c.row)) + 1,
      });
    });
  }
  return out;
}

/** All pieces, in a stable order. */
export const PIECES: readonly PieceShape[] = buildCatalog();

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export function getShape(id: string): PieceShape {
  const shape = BY_ID.get(id);
  if (!shape) throw new Error(`Unknown piece shape: ${id}`);
  return shape;
}
