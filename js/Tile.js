import {
  CHARSET, MATRIX_CHARSET,
  SCRAMBLE_COLORS, MATRIX_COLORS, GRAYSCALE_COLORS,
  SCRAMBLE_DURATION, FLIP_DURATION
} from './constants.js';

export class Tile {
  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.currentChar = ' ';
    this.isAnimating = false;
    this._scrambleTimer = null;

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
    this.currentChar = char;
    this.frontSpan.textContent = char === ' ' ? '' : char;
    this.backSpan.textContent = '';
    this.frontEl.style.backgroundColor = '';
    this.frontSpan.style.color = '';
    this.frontSpan.style.fontFamily = '';
  }

  scrambleTo(targetChar, delay, mode = 'color') {
    if (targetChar === this.currentChar) return;

    if (this._scrambleTimer) {
      clearInterval(this._scrambleTimer);
      this._scrambleTimer = null;
    }
    this.isAnimating = true;

    // Pick charset and colors based on mode
    const isMatrix = mode === 'matrix';
    const isGray = mode === 'grayscale';
    const charset = isMatrix ? MATRIX_CHARSET : CHARSET;
    const colors = isMatrix ? MATRIX_COLORS : isGray ? GRAYSCALE_COLORS : SCRAMBLE_COLORS;

    setTimeout(() => {
      this.el.classList.add('scrambling');

      // Matrix mode: set monospace font for katakana
      if (isMatrix) {
        this.frontSpan.style.fontFamily = '"Courier New", monospace';
        this.frontSpan.style.color = '#00FF41';
      }

      let scrambleCount = 0;
      const maxScrambles = 10 + Math.floor(Math.random() * 4);
      const scrambleInterval = 70;

      this._scrambleTimer = setInterval(() => {
        const randChar = charset[Math.floor(Math.random() * charset.length)];
        this.frontSpan.textContent = randChar === ' ' ? '' : randChar;

        if (isGray) {
          // Grayscale: no background, just flicker text brightness
          const grayShade = colors[scrambleCount % colors.length];
          this.frontSpan.style.color = grayShade;
          this.frontSpan.style.fontFamily = '';
        } else {
          // Color or matrix: tint background
          const color = colors[scrambleCount % colors.length];
          this.frontEl.style.backgroundColor = color;

          if (isMatrix) {
            // Matrix: always green text, darker bg on dim frames
            this.frontSpan.style.color = color === '#003B00' ? '#00FF41' : '#00FF41';
            this.frontSpan.style.fontFamily = '"Courier New", monospace';
          } else {
            // Color mode: contrast text on light backgrounds
            if (color === '#FFFFFF' || color === '#FFCC00') {
              this.frontSpan.style.color = '#111';
            } else {
              this.frontSpan.style.color = '';
            }
          }
        }

        scrambleCount++;

        if (scrambleCount >= maxScrambles) {
          clearInterval(this._scrambleTimer);
          this._scrambleTimer = null;

          // Reset all styling
          this.frontEl.style.backgroundColor = '';
          this.frontSpan.style.color = '';
          this.frontSpan.style.fontFamily = '';

          // Set final character (back to normal latin)
          this.frontSpan.textContent = targetChar === ' ' ? '' : targetChar;

          // Brief tilt settle
          this.innerEl.style.transition = `transform ${FLIP_DURATION}ms ease-in-out`;
          this.innerEl.style.transform = 'perspective(400px) rotateX(-8deg)';

          setTimeout(() => {
            this.innerEl.style.transform = '';
            setTimeout(() => {
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
}
