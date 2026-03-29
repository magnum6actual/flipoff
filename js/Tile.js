import {
  CHARSET,
  FLIP_STEP_DURATION,
  FLIP_STEP_FAST_DURATION,
  FLIP_SETTLE_DURATION,
  MIN_VISIBLE_FLIPS,
  MAX_VISIBLE_FLIPS
} from './constants.js';

export class Tile {
  constructor(row, col, boardCols = 22) {
    this.row = row;
    this.col = col;
    this.boardCols = boardCols;
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

  setColor(color) {
    const spans = [
      this.staticTopEl.span, this.staticBottomEl.span,
      this.topFlapEl.span, this.bottomFlapEl.span,
    ];
    for (const span of spans) {
      if (color) {
        span.style.color = color;
      } else {
        span.style.color = '';
      }
    }
  }

  cancelAnimation() {
    this._runId += 1;
    this._clearTimers();
    this.el.classList.remove('is-flipping');
    this.el.style.removeProperty('--flip-duration');
    this.isAnimating = false;
  }

  async flipTo(targetChar, delay = 0, transitionPlan = null) {
    const plan = transitionPlan || this.getTransitionPlan(targetChar, delay);
    if (!plan) return;

    this._runId += 1;
    const runId = this._runId;

    this._clearTimers();
    this.el.classList.remove('is-flipping');
    this.isAnimating = true;

    try {
      if (plan.delay > 0) {
        await this._wait(plan.delay, runId);
      }

      for (const step of plan.steps) {
        await this._flipStep(step.char, step.duration, runId);
      }
    } finally {
      if (runId === this._runId) {
        this.isAnimating = false;
      }
    }
  }

  getTransitionPlan(targetChar, delay = 0) {
    if (targetChar === this.currentChar) return null;

    const path = this._buildVisiblePath(targetChar);
    const steps = [];
    const soundEvents = [];
    let elapsed = delay;

    for (let i = 0; i < path.length; i++) {
      const duration = this._getStepDuration(i, path.length);
      steps.push({
        at: elapsed,
        char: path[i],
        duration
      });

      soundEvents.push({
        at: elapsed + (duration * 0.55),
        intensity: i === path.length - 1 ? 1.15 : 1,
        pan: this._getSoundPan(),
        isFinal: i === path.length - 1
      });

      elapsed += duration + FLIP_SETTLE_DURATION;
    }

    return {
      delay,
      steps,
      soundEvents,
      totalDuration: elapsed
    };
  }

  _buildVisiblePath(targetChar) {
    const charsetLength = CHARSET.length;
    const startInCharset = CHARSET.indexOf(this.currentChar) !== -1;
    const endInCharset = CHARSET.indexOf(targetChar) !== -1;

    // If either char is outside the charset (emoji, etc.), do a short
    // flip through a few random charset chars then land on the target.
    if (!startInCharset || !endInCharset) {
      const flips = MIN_VISIBLE_FLIPS;
      const path = [];
      for (let i = 0; i < flips; i++) {
        path.push(CHARSET[Math.floor(Math.random() * charsetLength)]);
      }
      path.push(targetChar);
      return path;
    }

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

  _getStepDuration(stepIndex, totalSteps) {
    const duration = totalSteps > 5 ? FLIP_STEP_FAST_DURATION : FLIP_STEP_DURATION;
    const jitter = ((this.row + this.col + stepIndex) % 3) * 10;
    return duration + jitter;
  }

  _getSoundPan() {
    if (this.boardCols <= 1) return 0;
    const normalized = this.col / (this.boardCols - 1);
    return (normalized * 2 - 1) * 0.35;
  }

  async _flipStep(nextChar, flipDuration, runId) {
    this._ensureRun(runId);

    this.el.style.setProperty('--flip-duration', `${flipDuration}ms`);
    this._setStaticChar(this.currentChar);
    this._setHalfChar(this.topFlapEl, this.currentChar);
    this._setHalfChar(this.bottomFlapEl, nextChar);

    this.el.classList.remove('is-flipping');
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
