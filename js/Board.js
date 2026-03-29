import { Tile } from './Tile.js';
import {
  GRID_COLS, GRID_ROWS, STAGGER_DELAY, ACCENT_COLORS
} from './constants.js';

// PR #1: Display mode accent color palettes
const DISPLAY_MODES = ['color', 'matrix', 'grayscale'];
const ACCENT_COLORS_BY_MODE = {
  color:     ACCENT_COLORS,
  matrix:    ['#00FF41', '#00CC33', '#00FF88', '#003B00', '#00FF41'],
  grayscale: ['#888888', '#AAAAAA', '#666666', '#CCCCCC', '#555555'],
};

export class Board {
  constructor(containerEl, soundEngine, config = {}) {
    this.cols = Number(config.cols) || GRID_COLS;
    this.rows = Number(config.rows) || GRID_ROWS;
    this.soundEngine = soundEngine;
    this.isTransitioning = false;
    this.pendingLines = null;
    this.pendingColors = null;
    this.tiles = [];
    this.currentGrid = [];
    this.accentIndex = 0;
    this.modeIndex = 0;

    // Build board DOM
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';
    this.boardEl.style.setProperty('--grid-cols', this.cols);
    this.boardEl.style.setProperty('--grid-rows', this.rows);

    // Left accent squares
    this.leftBar = this._createAccentBar('accent-bar-left');
    this.boardEl.appendChild(this.leftBar);

    // Tile grid
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tile-grid';

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      const charRow = [];
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c, this.cols);
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
      <div><span>Sound: <strong class="shortcut-sound-mode">Authentic</strong></span><kbd>M</kbd></div>
      <div><span>Random</span><kbd>R</kbd></div>
      <div><span>Color mode</span><kbd>C</kbd></div>
    `;
    this.boardEl.appendChild(overlay);

    this.shortcutSoundModeEl = overlay.querySelector('.shortcut-sound-mode');
    this._syncSoundShortcutLabel();
    document.addEventListener('soundmodechange', () => this._syncSoundShortcutLabel());

    containerEl.appendChild(this.boardEl);
    this._updateAccentColors();
  }

  _createAccentBar(extraClass) {
    const bar = document.createElement('div');
    bar.className = `accent-bar ${extraClass}`;
    for (let i = 0; i < 2; i++) {
      const seg = document.createElement('div');
      seg.className = 'accent-segment';
      bar.appendChild(seg);
    }
    return bar;
  }

  // PR #1: Display mode cycling
  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % DISPLAY_MODES.length;
    this._updateAccentColors();
    return DISPLAY_MODES[this.modeIndex];
  }

  get displayMode() {
    return DISPLAY_MODES[this.modeIndex];
  }

  _updateAccentColors() {
    const palette = ACCENT_COLORS_BY_MODE[this.displayMode];
    const color = palette[this.accentIndex % palette.length];
    const segments = this.boardEl.querySelectorAll('.accent-segment');
    segments.forEach(seg => {
      seg.style.backgroundColor = color;
    });
  }

  _syncSoundShortcutLabel() {
    if (!this.shortcutSoundModeEl || !this.soundEngine || !this.soundEngine.getSoundState) return;
    const state = this.soundEngine.getSoundState();
    this.shortcutSoundModeEl.textContent = state.label;
  }

  // PR #2: interrupt support
  interruptTransition() {
    this.pendingLines = null;
    this.isTransitioning = false;

    for (const row of this.tiles) {
      for (const tile of row) {
        tile.cancelAnimation();
      }
    }

    this.currentGrid = this.tiles.map((row) => row.map((tile) => tile.currentChar));
  }

  displayMessage(lines, { interrupt = false, colors = null } = {}) {
    if (interrupt) {
      this.interruptTransition();
    } else if (this.isTransitioning) {
      this.pendingLines = [...lines];
      this.pendingColors = colors;
      return null;
    }

    this.isTransitioning = true;

    const newGrid = this._formatToGrid(lines);

    let hasChanges = false;
    const animations = [];
    const soundEvents = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const oldChar = this.currentGrid[r][c];

        if (newChar !== oldChar) {
          const delay = (r * this.cols + c) * STAGGER_DELAY;
          const tile = this.tiles[r][c];
          const plan = tile.getTransitionPlan(newChar, delay);

          if (!plan) continue;

          animations.push(tile.flipTo(newChar, delay, plan));
          soundEvents.push(...plan.soundEvents);
          hasChanges = true;
        }
      }
    }

    if (hasChanges && this.soundEngine) {
      this.soundEngine.playTransition(soundEvents);
    }

    this.accentIndex++;
    this._updateAccentColors();

    if (!hasChanges) {
      this.currentGrid = newGrid;
      this._applyRowColors(colors);
      this.isTransitioning = false;
      return Promise.resolve(false);
    }

    return Promise.allSettled(animations).then(() => {
      this.currentGrid = newGrid;
      this._applyRowColors(colors);
      this.isTransitioning = false;

      if (this.pendingLines) {
        const nextLines = this.pendingLines;
        const nextColors = this.pendingColors;
        this.pendingLines = null;
        this.pendingColors = null;
        this.displayMessage(nextLines, { colors: nextColors });
      }

      return true;
    });
  }

  _applyRowColors(colors) {
    for (let r = 0; r < this.rows; r++) {
      const color = (colors && colors[r]) || null;
      for (let c = 0; c < this.cols; c++) {
        this.tiles[r][c].setColor(color);
      }
    }
  }

  _formatToGrid(lines) {
    // Cache segmenter instance — Intl.Segmenter handles emojis as single grapheme clusters
    if (!this._segmenter) {
      this._segmenter = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter()
        : null;
    }
    const segment = this._segmenter
      ? (str) => [...this._segmenter.segment(str)].map(s => s.segment)
      : (str) => [...str]; // Fallback for Firefox < 125
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      const line = (lines[r] || '').toUpperCase();
      const chars = segment(line);
      const padTotal = this.cols - chars.length;
      const padLeft = Math.max(0, Math.floor(padTotal / 2));
      const padRight = Math.max(0, this.cols - padLeft - chars.length);
      grid.push([...Array(padLeft).fill(' '), ...chars, ...Array(padRight).fill(' ')]);
    }
    return grid;
  }
}
