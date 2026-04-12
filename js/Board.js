import { Tile } from './Tile.js';
import { FLIP_CHARACTER_ORDER } from './constants.js';
import { formatLinesToGrid, isOrderedCharacter } from './text.js';

const MIN_TILE_SIZE = 18;
const MAX_TILE_SIZE = 96;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class Board {
  constructor(containerEl, soundEngine) {
    this.containerEl = containerEl;
    this.soundEngine = soundEngine;
    this.baseCols = 0;
    this.baseRows = 0;
    this.cols = 0;
    this.rows = 0;
    this.config = null;
    this.isTransitioning = false;
    this.tiles = [];
    this.currentGrid = [];
    this.accentIndex = 0;
    this.soundLabel = 'SOFT';
    this.remoteMessage = 'LOCAL';
    this.lastLines = [];
    this.resizeFrame = null;

    this.boardEl = document.createElement('div');
    this.boardEl.className = 'board';

    this.leftBar = this._createAccentBar('accent-bar-left');
    this.boardEl.appendChild(this.leftBar);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'tile-grid';
    this.boardEl.appendChild(this.gridEl);

    this.rightBar = this._createAccentBar('accent-bar-right');
    this.boardEl.appendChild(this.rightBar);

    const hint = document.createElement('div');
    hint.className = 'keyboard-hint';
    hint.title = 'Keyboard shortcuts and live status';
    hint.innerHTML = `
      <span class="hint-key">N</span>
      <span class="hint-sound">${this.soundLabel}</span>
    `;
    this.soundLabelEl = hint.querySelector('.hint-sound');
    hint.addEventListener('click', (e) => {
      e.stopPropagation();
      const overlay = this.boardEl.querySelector('.shortcuts-overlay');
      if (overlay) overlay.classList.toggle('visible');
    });
    this.boardEl.appendChild(hint);

    const overlay = document.createElement('div');
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div><span>Sound mode</span><strong data-role="sound-mode">${this.soundLabel}</strong></div>
      <div><span>Remote</span><strong data-role="remote-status">${this.remoteMessage}</strong></div>
      <div><span>Next message</span><kbd>Enter</kbd></div>
      <div><span>Previous</span><kbd>Left</kbd></div>
      <div><span>Fullscreen</span><kbd>F</kbd></div>
      <div><span>Sound mode</span><kbd>M</kbd></div>
    `;
    this.overlaySoundLabelEl = overlay.querySelector('[data-role="sound-mode"]');
    this.overlayRemoteLabelEl = overlay.querySelector('[data-role="remote-status"]');
    this.boardEl.appendChild(overlay);

    this.remoteBadgeEl = document.createElement('div');
    this.remoteBadgeEl.className = 'remote-badge remote-badge-local';
    this.remoteBadgeEl.textContent = this.remoteMessage;
    this.boardEl.appendChild(this.remoteBadgeEl);

    this.containerEl.appendChild(this.boardEl);

    this._scheduleLayoutSync = this._scheduleLayoutSync.bind(this);
    window.addEventListener('resize', this._scheduleLayoutSync);
    document.addEventListener('fullscreenchange', this._scheduleLayoutSync);

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this._scheduleLayoutSync());
      this.resizeObserver.observe(this.containerEl);
    }
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

  _updateAccentColors() {
    const colors = this.config?.theme?.accentColors || ['#00FF7F'];
    const color = colors[this.accentIndex % colors.length];
    const segments = this.boardEl.querySelectorAll('.accent-segment');
    segments.forEach((seg) => {
      seg.style.backgroundColor = color;
    });
  }

  applyConfig(config) {
    this.config = config;
    this.baseCols = config.grid.cols;
    this.baseRows = config.grid.rows;
    this._syncGridLayout({ force: this.tiles.length === 0 });
    this._updateAccentColors();
  }

  updateSoundMode(label) {
    this.soundLabel = String(label || '').toUpperCase();
    if (this.soundLabelEl) {
      this.soundLabelEl.textContent = this.soundLabel;
    }
    if (this.overlaySoundLabelEl) {
      this.overlaySoundLabelEl.textContent = this.soundLabel;
    }
  }

  updateRemoteStatus(status) {
    if (!status) {
      return;
    }

    const state = status.state || 'disabled';
    const label = state === 'ok'
      ? 'REMOTE'
      : state === 'error'
        ? 'REMOTE ERR'
        : 'LOCAL';

    this.remoteMessage = label;
    if (this.overlayRemoteLabelEl) {
      this.overlayRemoteLabelEl.textContent = label;
    }
    if (this.remoteBadgeEl) {
      this.remoteBadgeEl.textContent = label;
      this.remoteBadgeEl.className = `remote-badge remote-badge-${state === 'ok' ? 'ok' : state === 'error' ? 'error' : 'local'}`;
      this.remoteBadgeEl.title = status.message || label;
    }
  }

  async displayMessage(lines) {
    if (this.isTransitioning || !this.config) {
      return false;
    }

    this.lastLines = Array.isArray(lines) ? [...lines] : [];
    this.isTransitioning = true;
    const newGrid = formatLinesToGrid(lines, this.rows, this.cols);
    const promises = [];
    const events = [];
    let changedIndex = 0;
    let maxFinishMs = 0;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c];
        const oldChar = this.currentGrid[r][c];

        if (newChar !== oldChar) {
          const sequence = this._buildSequence(oldChar, newChar);
          const delayMs = changedIndex * this.config.timing.staggerDelayMs;
          const finishMs = delayMs + (sequence.length * this.config.timing.flipDurationMs);
          maxFinishMs = Math.max(maxFinishMs, finishMs);

          sequence.forEach((_, stepIndex) => {
            events.push({
              atMs: delayMs + (stepIndex * this.config.timing.flipDurationMs),
              weight: 1
            });
          });

          promises.push(
            this.tiles[r][c].flipThrough(sequence, {
              delayMs,
              flipDurationMs: this.config.timing.flipDurationMs,
              getStepColor: (stepIndex) => {
                const colors = this.config.theme.stepColors;
                return colors[(stepIndex + r + c) % colors.length];
              }
            })
          );
          changedIndex += 1;
        }
      }
    }

    if (events.length && this.soundEngine) {
      this.soundEngine.scheduleTransition(this._collapseEvents(events), {
        finalAtMs: maxFinishMs + this.config.timing.settleDelayMs
      });
    }

    this.accentIndex += 1;
    this._updateAccentColors();
    this.currentGrid = newGrid;
    await Promise.all(promises);
    await this._wait(this.config.timing.settleDelayMs);
    this.isTransitioning = false;
    return true;
  }

  _scheduleLayoutSync() {
    if (!this.config) {
      return;
    }

    if (this.resizeFrame) {
      window.cancelAnimationFrame(this.resizeFrame);
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this._syncGridLayout();
    });
  }

  _syncGridLayout({ force = false } = {}) {
    const layout = this._resolveAdaptiveLayout();
    const shouldRebuild = force || layout.cols !== this.cols || layout.rows !== this.rows;

    this.cols = layout.cols;
    this.rows = layout.rows;
    this.boardEl.style.setProperty('--grid-cols', this.cols);
    this.boardEl.style.setProperty('--grid-rows', this.rows);
    this.boardEl.style.setProperty('--tile-size', `${layout.tileSize}px`);

    if (shouldRebuild) {
      this._rebuildGrid();
      this._paintCurrentMessage();
    }
  }

  _resolveAdaptiveLayout() {
    const baseCols = Math.max(1, this.baseCols || this.config?.grid?.cols || 22);
    const baseRows = Math.max(1, this.baseRows || this.config?.grid?.rows || 5);
    const baseAspect = baseCols / baseRows;
    const containerRect = this.containerEl.getBoundingClientRect();
    const viewportWidth = containerRect.width || window.innerWidth || 1280;
    const viewportHeight = Math.max(containerRect.height || 0, Math.round((window.innerHeight || 720) * 0.45));
    const viewportAspect = clamp(viewportWidth / Math.max(1, viewportHeight), 0.8, 6);
    const aspectScale = Math.sqrt(viewportAspect / baseAspect);

    const cols = clamp(
      Math.round(baseCols * aspectScale),
      Math.max(8, Math.floor(baseCols * 0.55)),
      Math.min(48, Math.ceil(baseCols * 1.8))
    );
    const rows = clamp(
      Math.round(baseRows / aspectScale),
      Math.max(3, Math.floor(baseRows * 0.6)),
      Math.min(12, Math.ceil(baseRows * 2.2))
    );

    const boardStyle = window.getComputedStyle(this.boardEl);
    const gridStyle = window.getComputedStyle(this.gridEl);
    const horizontalPadding = (parseFloat(boardStyle.paddingLeft) || 0) + (parseFloat(boardStyle.paddingRight) || 0);
    const verticalPadding = (parseFloat(boardStyle.paddingTop) || 0) + (parseFloat(boardStyle.paddingBottom) || 0);
    const gapX = parseFloat(gridStyle.columnGap || gridStyle.gap) || 4;
    const gapY = parseFloat(gridStyle.rowGap || gridStyle.gap) || gapX;
    const availableWidth = Math.max(220, viewportWidth - horizontalPadding - 8);
    const availableHeight = Math.max(140, viewportHeight - verticalPadding - 8);
    const tileByWidth = (availableWidth - (gapX * (cols - 1))) / cols;
    const tileByHeight = (availableHeight - (gapY * (rows - 1))) / rows;
    const tileSize = Math.floor(clamp(Math.min(tileByWidth, tileByHeight), MIN_TILE_SIZE, MAX_TILE_SIZE));

    return { cols, rows, tileSize };
  }

  _paintCurrentMessage() {
    const nextGrid = formatLinesToGrid(this.lastLines, this.rows, this.cols);

    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.cols; c += 1) {
        this.tiles[r][c].setChar(nextGrid[r][c]);
      }
    }

    this.currentGrid = nextGrid;
  }

  _rebuildGrid() {
    this.gridEl.innerHTML = '';
    this.tiles = [];
    this.currentGrid = [];

    for (let r = 0; r < this.rows; r += 1) {
      const row = [];
      const charRow = [];
      for (let c = 0; c < this.cols; c += 1) {
        const tile = new Tile(r, c);
        this.gridEl.appendChild(tile.el);
        row.push(tile);
        charRow.push(' ');
      }
      this.tiles.push(row);
      this.currentGrid.push(charRow);
    }
  }

  _buildSequence(fromChar, toChar) {
    if (fromChar === toChar) {
      return [];
    }

    if (isOrderedCharacter(fromChar) && isOrderedCharacter(toChar)) {
      const fromIndex = FLIP_CHARACTER_ORDER.indexOf(fromChar);
      const toIndex = FLIP_CHARACTER_ORDER.indexOf(toChar);
      const sequence = [];

      for (let step = 1; step <= this.config.timing.maxOrderedSteps; step += 1) {
        const index = (fromIndex + step) % FLIP_CHARACTER_ORDER.length;
        sequence.push(FLIP_CHARACTER_ORDER[index]);
        if (index === toIndex) {
          return sequence;
        }
      }

      sequence.push(toChar);
      return sequence;
    }

    const fallback = [];
    if (fromChar !== '#') {
      fallback.push('#');
    }
    fallback.push(toChar);
    return fallback;
  }

  _collapseEvents(events) {
    const buckets = new Map();
    events.forEach((event) => {
      const key = Math.round(event.atMs / 18) * 18;
      buckets.set(key, (buckets.get(key) || 0) + event.weight);
    });
    return [...buckets.entries()]
      .map(([atMs, weight]) => ({ atMs, weight }))
      .sort((left, right) => left.atMs - right.atMs);
  }

  _wait(durationMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }
}
