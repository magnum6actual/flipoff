import { GRID_COLS, GRID_ROWS, CHARSET } from './constants.js';

/**
 * Wrap arbitrary text into a 5-line × 22-column board grid.
 * Handles: uppercase conversion, character sanitization, word-wrap,
 * explicit newlines, hard-cutting of words longer than 22 chars.
 * Returns exactly GRID_ROWS strings.
 */
export function wrapToBoard(rawText) {
  const upper = rawText.toUpperCase();
  // Preserve newlines for explicit line breaks; replace everything else
  // not in CHARSET with a space.
  const sanitized = upper.split('').map(ch =>
    ch === '\n' ? '\n' : (CHARSET.includes(ch) ? ch : ' ')
  ).join('');

  const paragraphs = sanitized.split('\n');
  const outputLines = [];

  for (const para of paragraphs) {
    if (outputLines.length >= GRID_ROWS) break;

    const words = para.trim().split(/\s+/).filter(w => w.length > 0);

    if (words.length === 0) {
      outputLines.push('');
      continue;
    }

    let current = '';

    for (const word of words) {
      if (outputLines.length >= GRID_ROWS) break;

      // Hard-cut word into GRID_COLS-length chunks if it's too long
      const chunks = [];
      for (let i = 0; i < word.length; i += GRID_COLS) {
        chunks.push(word.slice(i, i + GRID_COLS));
      }

      for (const chunk of chunks) {
        if (outputLines.length >= GRID_ROWS) break;

        if (current === '') {
          current = chunk;
        } else if (current.length + 1 + chunk.length <= GRID_COLS) {
          current += ' ' + chunk;
        } else {
          outputLines.push(current);
          current = chunk;
        }
      }
    }

    if (current && outputLines.length < GRID_ROWS) {
      outputLines.push(current);
    }
  }

  while (outputLines.length < GRID_ROWS) outputLines.push('');
  return outputLines.slice(0, GRID_ROWS);
}

/**
 * Center a single line within GRID_COLS, matching Board._formatToGrid logic.
 * Used to render the preview grid in control.html.
 */
export function centerLine(line) {
  const trimmed = line.slice(0, GRID_COLS);
  const padTotal = GRID_COLS - trimmed.length;
  const padLeft = Math.max(0, Math.floor(padTotal / 2));
  return ' '.repeat(padLeft) + trimmed + ' '.repeat(Math.max(0, GRID_COLS - padLeft - trimmed.length));
}
