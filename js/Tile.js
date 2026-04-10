export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.animationToken = 0;

    this.el = document.createElement('div');
    this.el.className = 'tile';
    this.el.style.setProperty('--flip-duration', '135ms');

    this.staticFace = this._buildFace('tile-static-face');
    this.flapTop = this._buildHalf('tile-half tile-flap tile-flap-top');
    this.flapBottom = this._buildHalf('tile-half tile-flap tile-flap-bottom');

    this.el.appendChild(this.staticFace.face);
    this.el.appendChild(this.flapTop.half);
    this.el.appendChild(this.flapBottom.half);

    this.setChar(' ');
  }

  _buildFace(className) {
    const face = document.createElement('div');
    face.className = className;
    const span = document.createElement('span');
    span.className = 'tile-char';
    face.appendChild(span);
    return { face, span };
  }

  _buildHalf(className) {
    const half = document.createElement('div');
    half.className = className;
    const span = document.createElement('span');
    span.className = 'tile-char';
    half.appendChild(span);
    return { half, span };
  }

  setChar(char) {
    this.currentChar = char;
    this._setHalfText(this.staticFace.span, char);
    this._setHalfText(this.flapTop.span, char);
    this._setHalfText(this.flapBottom.span, char);
    this.el.style.removeProperty('--tile-step-color');
  }

  _setHalfText(span, char) {
    span.textContent = char === ' ' ? '' : char;
  }

  async flipThrough(sequence, options = {}) {
    const {
      delayMs = 0,
      flipDurationMs = 135,
      getStepColor = null,
      onStepStart = null
    } = options;

    const token = ++this.animationToken;

    await this._wait(delayMs);
    if (token !== this.animationToken) {
      return;
    }

    for (let index = 0; index < sequence.length; index += 1) {
      const nextChar = sequence[index];
      const color = typeof getStepColor === 'function' ? getStepColor(index) : '';
      if (typeof onStepStart === 'function') {
        onStepStart(nextChar, index);
      }
      await this._animateStep(nextChar, flipDurationMs, color, token);
      if (token !== this.animationToken) {
        return;
      }
    }
  }

  async _animateStep(nextChar, flipDurationMs, color, token) {
    if (token !== this.animationToken) {
      return;
    }

    this.el.style.setProperty('--flip-duration', `${flipDurationMs}ms`);
    if (color) {
      this.el.style.setProperty('--tile-step-color', color);
    } else {
      this.el.style.removeProperty('--tile-step-color');
    }

    this._setHalfText(this.staticFace.span, this.currentChar);
    this._setHalfText(this.flapTop.span, this.currentChar);
    this._setHalfText(this.flapBottom.span, nextChar);

    this.el.classList.remove('flip-top-active', 'flip-bottom-active');
    void this.el.offsetWidth;
    this.el.classList.add('flip-top-active');

    await this._wait(Math.max(45, Math.floor(flipDurationMs / 2)));
    if (token !== this.animationToken) {
      return;
    }

    this._setHalfText(this.staticFace.span, nextChar);
    this.el.classList.remove('flip-top-active');
    this.el.classList.add('flip-bottom-active');

    await this._wait(Math.max(45, Math.ceil(flipDurationMs / 2)));
    if (token !== this.animationToken) {
      return;
    }

    this.el.classList.remove('flip-bottom-active');
    this.currentChar = nextChar;
  }

  _wait(durationMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, durationMs);
    });
  }
}
