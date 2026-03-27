import { CHARSET, SCRAMBLE_COLORS, SCRAMBLE_DURATION, FLIP_DURATION } from './constants.js';

export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.isAnimating = false;
    this._startTimer = null;
    this._scrambleTimer = null;
    this._settleTimer = null;
    this._cleanupTimer = null;

    // Build DOM
    this.el = document.createElement('div');
    this.el.className = 'tile';

    this.innerEl = document.createElement('div');
    this.innerEl.className = 'tile-inner';

    this.frontEl = document.createElement('div');
    this.frontEl.className = 'tile-front';
    this.frontSpan = document.createElement('span');
    this.frontEl.appendChild(this.frontSpan);

    this.backEl = document.createElement('div');
    this.backEl.className = 'tile-back';
    this.backSpan = document.createElement('span');
    this.backEl.appendChild(this.backSpan);

    this.innerEl.appendChild(this.frontEl);
    this.innerEl.appendChild(this.backEl);
    this.el.appendChild(this.innerEl);
  }

  setChar(char) {
    this.cancelAnimation();
    this.currentChar = char;
    this.frontSpan.textContent = char === ' ' ? '' : char;
    this.backSpan.textContent = '';
    this.frontEl.style.backgroundColor = '';
    this.frontSpan.style.color = '';
    this.innerEl.style.transition = '';
    this.innerEl.style.transform = '';
    this.el.classList.remove('scrambling');
  }

  scrambleTo(targetChar, delay) {
    if (targetChar === this.currentChar) return;

    this.cancelAnimation();
    this.isAnimating = true;

    this._startTimer = window.setTimeout(() => {
      this._startTimer = null;
      this.el.classList.add('scrambling');
      let scrambleCount = 0;
      const maxScrambles = 10 + Math.floor(Math.random() * 4);
      const scrambleInterval = 70;

      this._scrambleTimer = window.setInterval(() => {
        // Random character
        const randChar = CHARSET[Math.floor(Math.random() * CHARSET.length)];
        this.frontSpan.textContent = randChar === ' ' ? '' : randChar;

        // Cycle background color
        const color = SCRAMBLE_COLORS[scrambleCount % SCRAMBLE_COLORS.length];
        this.frontEl.style.backgroundColor = color;

        // Briefly change text color for contrast on light backgrounds
        if (color === '#FFFFFF' || color === '#FFCC00') {
          this.frontSpan.style.color = '#111';
        } else {
          this.frontSpan.style.color = '';
        }

        scrambleCount++;

        if (scrambleCount >= maxScrambles) {
          window.clearInterval(this._scrambleTimer);
          this._scrambleTimer = null;

          // Reset colors
          this.frontEl.style.backgroundColor = '';
          this.frontSpan.style.color = '';

          // Set the final character directly (skip 3D flip for reliability)
          // Use a brief opacity flash to simulate the flip settle
          this.frontSpan.textContent = targetChar === ' ' ? '' : targetChar;

          // Quick flash effect: brief scale transform
          this.innerEl.style.transition = `transform ${FLIP_DURATION}ms ease-in-out`;
          this.innerEl.style.transform = 'perspective(400px) rotateX(-8deg)';

          this._settleTimer = window.setTimeout(() => {
            this._settleTimer = null;
            this.innerEl.style.transform = '';
            this._cleanupTimer = window.setTimeout(() => {
              this._cleanupTimer = null;
              this.innerEl.style.transition = '';
              this.el.classList.remove('scrambling');
              this.currentChar = targetChar;
              this.isAnimating = false;
            }, FLIP_DURATION);
          }, FLIP_DURATION / 2);
        }
      }, scrambleInterval);
    }, delay);
  }

  cancelAnimation() {
    if (this._startTimer) {
      window.clearTimeout(this._startTimer);
      this._startTimer = null;
    }

    if (this._scrambleTimer) {
      window.clearInterval(this._scrambleTimer);
      this._scrambleTimer = null;
    }

    if (this._settleTimer) {
      window.clearTimeout(this._settleTimer);
      this._settleTimer = null;
    }

    if (this._cleanupTimer) {
      window.clearTimeout(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    this.innerEl.style.transition = '';
    this.innerEl.style.transform = '';
    this.frontEl.style.backgroundColor = '';
    this.frontSpan.style.color = '';
    this.el.classList.remove('scrambling');
    this.currentChar = this.frontSpan.textContent || ' ';
    this.isAnimating = false;
  }
}
