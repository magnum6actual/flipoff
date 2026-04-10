import { FLIP_CHARACTER_ORDER } from './constants.js';

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function toGraphemes(value) {
  const text = value == null ? '' : String(value);
  if (!text) {
    return [];
  }

  if (segmenter) {
    return [...segmenter.segment(text)].map((segment) => segment.segment);
  }

  return Array.from(text);
}

export function normalizeDisplayGrapheme(value) {
  if (!value) {
    return ' ';
  }

  return value.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function fitLineToCells(line, cols) {
  const graphemes = toGraphemes(line).map(normalizeDisplayGrapheme);
  if (graphemes.length <= cols) {
    return graphemes;
  }

  if (cols <= 1) {
    return ['…'];
  }

  return [...graphemes.slice(0, cols - 1), '…'];
}

export function centerCells(cells, cols) {
  const visibleCells = cells.slice(0, cols);
  const totalPadding = Math.max(0, cols - visibleCells.length);
  const padLeft = Math.floor(totalPadding / 2);
  const padRight = totalPadding - padLeft;

  return [
    ...Array.from({ length: padLeft }, () => ' '),
    ...visibleCells,
    ...Array.from({ length: padRight }, () => ' ')
  ];
}

export function formatLinesToGrid(lines, rows, cols) {
  const normalizedLines = Array.isArray(lines) ? lines : [];
  const grid = [];

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const line = normalizedLines[rowIndex] || '';
    const fitted = fitLineToCells(line, cols);
    grid.push(centerCells(fitted, cols));
  }

  return grid;
}

export function isOrderedCharacter(value) {
  return FLIP_CHARACTER_ORDER.includes(value);
}
