import { Tile } from './Tile.js';
import {
  STAGGER_DELAY, SCRAMBLE_DURATION,
  TOTAL_TRANSITION, ACCENT_COLORS
} from './constants.js';

export class Board {
  /** Returns the breakpoint tier string for the current viewport width. */
  static getGridTier() {
    if (document.fullscreenElement) return 'fullscreen';
    const w = window.innerWidth;
    if (w >= 900) return 'large';
    if (w >= 601) return 'medium';
    return 'small';
  }

  /** Returns {cols, rows} appropriate for the current viewport width. */
  static getGridDimensions() {
    if (document.fullscreenElement) {
      const w = window.innerWidth, h = window.innerHeight;
      // Cols by viewport width tier so lines have a comfortable reading length
      const cols = w >= 1600 ? 22 : w >= 1100 ? 16 : w >= 700 ? 14 : 12;
      // Derive square tile size from cols, then compute rows — cap at 8 so
      // the content block always fills a large fraction of the screen
      const tileSize = Math.floor(w / cols);
      const rows = Math.min(8, Math.max(5, Math.floor(h / tileSize)));
      return { cols, rows };
    }
    const w = window.innerWidth;
    if (w >= 900) return { cols: 22, rows: 5 };
    if (w >= 601) return { cols: 16, rows: 5 };
    return { cols: 12, rows: 4 };
  }

  constructor(containerEl, soundEngine) {
    const { cols, rows } = Board.getGridDimensions();
    this.cols = cols;
    this.rows = rows;
    this.soundEngine = soundEngine;
    this.isTransitioning = false;
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

  displayMessage(lines) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

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
    setTimeout(() => {
      this.isTransitioning = false;
    }, TOTAL_TRANSITION + 200);
  }

  _formatToGrid(lines) {
    const grid = [];
    // Vertically center the message block in the available rows
    const vPad = Math.max(0, Math.floor((this.rows - lines.length) / 2));
    for (let r = 0; r < this.rows; r++) {
      const lineIndex = r - vPad;
      const line = (lineIndex >= 0 && lineIndex < lines.length ? lines[lineIndex] : '')
        .toUpperCase()
        .slice(0, this.cols);
      const padTotal = this.cols - line.length;
      const padLeft = Math.max(0, Math.floor(padTotal / 2));
      const padded = ' '.repeat(padLeft) + line + ' '.repeat(Math.max(0, this.cols - padLeft - line.length));
      grid.push(padded.split(''));
    }
    return grid;
  }
}
