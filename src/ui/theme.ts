/**
 * Visual theme: colour values and per-colour patterns (for colour-blind
 * accessibility, every colour also has a distinct symbol).
 */
import type { ColorId } from '../engine';

export type PatternId =
  'dot' | 'triangle' | 'diamond' | 'plus' | 'ring' | 'square' | 'cross' | 'bars' | 'stone';

export interface BlockColor {
  name: string;
  base: string;
  light: string;
  dark: string;
  pattern: PatternId;
}

export const BLOCK_COLORS: Record<ColorId, BlockColor> = {
  red: { name: 'Red', base: '#ff4d5e', light: '#ff8a96', dark: '#c22639', pattern: 'dot' },
  orange: {
    name: 'Orange',
    base: '#ff9a1f',
    light: '#ffc06b',
    dark: '#c76a00',
    pattern: 'triangle',
  },
  yellow: {
    name: 'Yellow',
    base: '#ffd23f',
    light: '#ffe68a',
    dark: '#c99a00',
    pattern: 'diamond',
  },
  green: { name: 'Green', base: '#2fd27a', light: '#7cebb0', dark: '#16924f', pattern: 'plus' },
  cyan: { name: 'Cyan', base: '#25d9e8', light: '#86eef6', dark: '#0f98a6', pattern: 'ring' },
  blue: { name: 'Blue', base: '#3d7bff', light: '#86adff', dark: '#1d4fc4', pattern: 'square' },
  purple: { name: 'Purple', base: '#a35cf0', light: '#c99bff', dark: '#6c2db8', pattern: 'cross' },
  pink: { name: 'Pink', base: '#ff5fc1', light: '#ff9fdb', dark: '#c42a8a', pattern: 'bars' },
};

export const STONE: BlockColor = {
  name: 'Stone',
  base: '#7d8597',
  light: '#a7aebd',
  dark: '#4b5263',
  pattern: 'stone',
};

export const colorOf = (c: ColorId | null): BlockColor => (c ? BLOCK_COLORS[c] : STONE);
