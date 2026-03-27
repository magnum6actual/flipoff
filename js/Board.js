import { Tile } from './Tile.js';
import {
  DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, STAGGER_DELAY,
  TOTAL_TRANSITION, ACCENT_COLORS
} from './constants.js';

export class Board {
  constructor(containerEl, soundEngine, config = {}) {
    this.cols = Number(config.cols) || DEFAULT_GRID_COLS;
    this.rows = Number(config.rows) || DEFAULT_GRID_ROWS;
    this.soundEngine = soundEngine;
    this.isTransitioning = false;
    this.pendingLines = null;
    this.transitionTimer = null;
    this.tiles = [];
    this.currentGrid = [];
    this.accentIndex = 0;

    // Build board DOM
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';
    this.boardEl.style.setProperty('--grid-cols', this.cols);
    this.boardEl.style.setProperty('--grid-rows', this.rows);

    // Left accent squares (2 small stacked blocks)
    this.leftBar = this._createAccentBar('accent-bar-left');
    this.boardEl.appendChild(this.leftBar);

    // Tile grid
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tile-grid';

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const charRow = [];
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c);
        tile.setChar(' ');
        this.gridEl.appendChild(tile.el);
        row.push(tile);
        charRow.push(' ');
      }
      this.tiles.push(row);
      this.currentGrid.push(charRow);
    }

    this.boardEl.appendChild(this.gridEl);

    // Right accent squares
    this.rightBar = this._createAccentBar('accent-bar-right');
    this.boardEl.appendChild(this.rightBar);

    // Keyboard hint icon (bottom-left)
    const hint = document.createElement('div');
    hint.className = 'keyboard-hint';
    hint.textContent = 'N';
    hint.title = 'Keyboard shortcuts';
    hint.addEventListener('click', (e) => {
      e.stopPropagation();
      const overlay = this.boardEl.querySelector('.shortcuts-overlay');
      if (overlay) overlay.classList.toggle('visible');
    });
    this.boardEl.appendChild(hint);

    // Shortcuts overlay
    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div><span>Next message</span><kbd>Enter</kbd></div>
      <div><span>Previous</span><kbd>\u2190</kbd></div>
      <div><span>Fullscreen</span><kbd>F</kbd></div>
      <div><span>Mute</span><kbd>M</kbd></div>
    `;
    this.boardEl.appendChild(overlay);

    containerEl.appendChild(this.boardEl);
    this._updateAccentColors();
  }

  _createAccentBar(extraClass) {
    const bar = document.createElement('div');
    bar.className = `accent-bar ${extraClass}`;
    // Just 2 small stacked squares like the original
    for (let i = 0; i < 2; i++) {
      const seg = document.createElement('div');
      seg.className = 'accent-segment';
      bar.appendChild(seg);
    }
    return bar;
  }

  _updateAccentColors() {
    const color = ACCENT_COLORS[this.accentIndex % ACCENT_COLORS.length];
    const segments = this.boardEl.querySelectorAll('.accent-segment');
    segments.forEach(seg => {
      seg.style.backgroundColor = color;
    });
  }

  displayMessage(lines, { interrupt = false } = {}) {
    if (interrupt) {
      this.interruptTransition();
    } else if (this.isTransitioning) {
      this.pendingLines = [...lines];
      return;
    }

    // Format lines into grid
    const newGrid = this._formatToGrid(lines);

    // Determine which tiles need to change
    let hasChanges = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const oldChar = this.currentGrid[r][c];

        if (newChar !== oldChar) {
          const delay = (r * this.cols + c) * STAGGER_DELAY;
          this.tiles[r][c].scrambleTo(newChar, delay);
          hasChanges = true;
        }
      }
    }

    if (!hasChanges) {
      return;
    }

    this.isTransitioning = true;

    // Play the single transition audio clip once
    if (hasChanges && this.soundEngine) {
      this.soundEngine.playTransition();
    }

    // Update accent bar colors
    this.accentIndex++;
    this._updateAccentColors();

    // Update grid state
    this.currentGrid = newGrid;

    // Clear transitioning flag after animation completes
    window.clearTimeout(this.transitionTimer);
    this.transitionTimer = window.setTimeout(() => {
      this.isTransitioning = false;
      if (this.pendingLines) {
        const nextLines = this.pendingLines;
        this.pendingLines = null;
        this.displayMessage(nextLines);
      }
    }, TOTAL_TRANSITION + 200);
  }

  interruptTransition() {
    if (this.transitionTimer) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    this.pendingLines = null;
    this.isTransitioning = false;

    for (const row of this.tiles) {
      for (const tile of row) {
        tile.cancelAnimation();
      }
    }

    this.currentGrid = this.tiles.map((row) => row.map((tile) => tile.currentChar));
  }

  _formatToGrid(lines) {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      const line = (lines[r] || '').toUpperCase();
      const padTotal = this.cols - line.length;
      const padLeft = Math.max(0, Math.floor(padTotal / 2));
      const padded = ' '.repeat(padLeft) + line + ' '.repeat(Math.max(0, this.cols - padLeft - line.length));
      grid.push(padded.split(''));
    }
    return grid;
  }
}
