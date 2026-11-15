/**
 * Pure grid helpers. Functions that "modify" a board return a new board.
 */
import type { PieceShape } from './pieces';
import type { Board, Cell, ClearedCell, Point } from './types';

export function createBoard(width: number, height: number): Board {
  return { width, height, cells: new Array<Cell | null>(width * height).fill(null) };
}

export function cloneBoard(board: Board): Board {
  return { width: board.width, height: board.height, cells: board.cells.slice() };
}

export const idx = (board: Board, row: number, col: number): number => row * board.width + col;

export function getCell(board: Board, row: number, col: number): Cell | null {
  return board.cells[idx(board, row, col)];
}

export function inBounds(board: Board, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < board.height && col < board.width;
}

/** Can `shape` be placed with its top-left corner at (row, col)? */
export function canPlace(board: Board, shape: PieceShape, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row + shape.height > board.height || col + shape.width > board.width) {
    return false;
  }
  for (const c of shape.cells) {
    if (board.cells[(row + c.row) * board.width + col + c.col] !== null) return false;
  }
  return true;
}

/** Board cells the shape would cover if placed at (row, col). */
export function cellsFor(shape: PieceShape, row: number, col: number): Point[] {
  return shape.cells.map((c) => ({ row: row + c.row, col: col + c.col }));
}

/** Writes the cells; assumes canPlace() was checked. Returns a new board. */
export function placeCells(board: Board, points: Point[], cell: Cell): Board {
  const next = cloneBoard(board);
  for (const p of points) next.cells[idx(next, p.row, p.col)] = { ...cell };
  return next;
}

/** Indices of completely filled rows and columns. */
export function findFullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < board.height; r++) {
    let full = true;
    for (let c = 0; c < board.width && full; c++) full = board.cells[r * board.width + c] !== null;
    if (full) rows.push(r);
  }
  for (let c = 0; c < board.width; c++) {
    let full = true;
    for (let r = 0; r < board.height && full; r++) full = board.cells[r * board.width + c] !== null;
    if (full) cols.push(c);
  }
  return { rows, cols };
}

/**
 * Clears the given rows and columns simultaneously. A cell at the
 * intersection of a cleared row and column is reported once.
 */
export function clearLines(
  board: Board,
  rows: number[],
  cols: number[],
): { board: Board; cleared: ClearedCell[] } {
  const next = cloneBoard(board);
  const cleared: ClearedCell[] = [];
  const take = (r: number, c: number) => {
    const i = idx(next, r, c);
    const cell = next.cells[i];
    if (cell) {
      cleared.push({ row: r, col: c, cell });
      next.cells[i] = null;
    }
  };
  for (const r of rows) for (let c = 0; c < next.width; c++) take(r, c);
  for (const c of cols) for (let r = 0; r < next.height; r++) take(r, c);
  return { board: next, cleared };
}

/** Does the shape fit anywhere on the board? */
export function fitsAnywhere(board: Board, shape: PieceShape): boolean {
  for (let r = 0; r + shape.height <= board.height; r++) {
    for (let c = 0; c + shape.width <= board.width; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

export function isEmpty(board: Board): boolean {
  return board.cells.every((c) => c === null);
}

export function countCells(board: Board, pred: (cell: Cell) => boolean): number {
  let n = 0;
  for (const c of board.cells) if (c && pred(c)) n++;
  return n;
}
