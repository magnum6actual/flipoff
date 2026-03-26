import {
  CHARSET,
  FLIP_STEP_DURATION,
  FLIP_STEP_FAST_DURATION,
  FLIP_SETTLE_DURATION,
  MIN_VISIBLE_FLIPS,
  MAX_VISIBLE_FLIPS
} from './constants.js';

export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.isAnimating = false;
    this._timeouts = new Set();
    this._runId = 0;

    // Build DOM
    this.el = document.createElement('div');
    this.el.className = 'tile';

    this.staticTopEl = this._createHalf('tile-half tile-half-top tile-static tile-static-top');
    this.staticBottomEl = this._createHalf('tile-half tile-half-bottom tile-static tile-static-bottom');
    this.topFlapEl = this._createHalf('tile-half tile-half-top tile-flap tile-flap-top');
    this.bottomFlapEl = this._createHalf('tile-half tile-half-bottom tile-flap tile-flap-bottom');

    this.el.appendChild(this.staticTopEl.half);
    this.el.appendChild(this.staticBottomEl.half);
    this.el.appendChild(this.topFlapEl.half);
    this.el.appendChild(this.bottomFlapEl.half);

    this.setChar(' ');
  }

  _createHalf(className) {
    const half = document.createElement('div');
    half.className = className;

    const span = document.createElement('span');
    half.appendChild(span);

    return { half, span };
  }

  _renderChar(char) {
    return char === ' ' ? '\u00A0' : char;
  }

  _setHalfChar(target, char) {
    target.span.textContent = this._renderChar(char);
  }

  _setStaticChar(char) {
    this._setHalfChar(this.staticTopEl, char);
    this._setHalfChar(this.staticBottomEl, char);
  }

  setChar(char) {
    this.currentChar = char;
    this._setStaticChar(char);
    this._setHalfChar(this.topFlapEl, char);
    this._setHalfChar(this.bottomFlapEl, char);
    this.el.classList.remove('is-flipping');
    this.el.style.removeProperty('--flip-duration');
  }

  async flipTo(targetChar, delay = 0) {
    if (targetChar === this.currentChar) return;

    this._runId += 1;
    const runId = this._runId;

    this._clearTimers();
    this.el.classList.remove('is-flipping');
    this.isAnimating = true;

    try {
      if (delay > 0) {
        await this._wait(delay, runId);
      }

      const path = this._buildVisiblePath(targetChar);
      for (let i = 0; i < path.length; i++) {
        await this._flipStep(path[i], i, path.length, runId);
      }
    } finally {
      if (runId === this._runId) {
        this.isAnimating = false;
      }
    }
  }

  _buildVisiblePath(targetChar) {
    const charsetLength = CHARSET.length;
    const startIndex = this._getCharIndex(this.currentChar);
    const endIndex = this._getCharIndex(targetChar);
    const distance = (endIndex - startIndex + charsetLength) % charsetLength;

    if (distance === 0) {
      return [];
    }

    if (distance <= MAX_VISIBLE_FLIPS) {
      return Array.from({ length: distance }, (_, index) =>
        CHARSET[(startIndex + index + 1) % charsetLength]
      );
    }

    const visibleSteps = Math.min(
      MAX_VISIBLE_FLIPS,
      Math.max(MIN_VISIBLE_FLIPS, Math.round(distance / 4))
    );
    const path = [];
    let previousStep = 0;

    for (let stepIndex = 1; stepIndex <= visibleSteps; stepIndex++) {
      let step = Math.round((stepIndex / visibleSteps) * distance);
      step = Math.max(previousStep + 1, Math.min(distance, step));
      path.push(CHARSET[(startIndex + step) % charsetLength]);
      previousStep = step;
    }

    return path;
  }

  _getCharIndex(char) {
    const index = CHARSET.indexOf(char);
    return index === -1 ? CHARSET.length - 1 : index;
  }

  async _flipStep(nextChar, stepIndex, totalSteps, runId) {
    this._ensureRun(runId);

    const duration = totalSteps > 5 ? FLIP_STEP_FAST_DURATION : FLIP_STEP_DURATION;
    const jitter = ((this.row + this.col + stepIndex) % 3) * 10;
    const flipDuration = duration + jitter;

    this.el.style.setProperty('--flip-duration', `${flipDuration}ms`);
    this._setStaticChar(this.currentChar);
    this._setHalfChar(this.topFlapEl, this.currentChar);
    this._setHalfChar(this.bottomFlapEl, nextChar);

    this.el.classList.remove('is-flipping');
    // Force a reflow so the same class can retrigger cleanly on repeated flips.
    void this.el.offsetWidth;
    this.el.classList.add('is-flipping');

    await this._wait(flipDuration / 2, runId);
    this._setStaticChar(nextChar);

    await this._wait((flipDuration / 2) + FLIP_SETTLE_DURATION, runId);
    this.el.classList.remove('is-flipping');
    this.currentChar = nextChar;
    this._setHalfChar(this.topFlapEl, nextChar);
    this._setHalfChar(this.bottomFlapEl, nextChar);
  }

  _wait(delay, runId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._timeouts.delete(timer);
        try {
          this._ensureRun(runId);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, delay);

      this._timeouts.add(timer);
    });
  }

  _clearTimers() {
    this._timeouts.forEach((timer) => clearTimeout(timer));
    this._timeouts.clear();
  }

  _ensureRun(runId) {
    if (runId !== this._runId) {
      throw new Error('Tile animation interrupted');
    }
  }
}
