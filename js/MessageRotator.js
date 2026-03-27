import { MESSAGES, MESSAGE_INTERVAL, TOTAL_TRANSITION } from './constants.js';

export class MessageRotator {
  constructor(board) {
    this.board = board;
    this.messages = MESSAGES;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this.randomMode = false;
  }

  start() {
    // Shuffle messages on load
    this._shuffle();

    // Show first message immediately
    this.next();

    // Begin auto-rotation
    this._timer = setInterval(() => {
      if (!this._paused && !this.board.isTransitioning) {
        this.next();
      }
    }, MESSAGE_INTERVAL + TOTAL_TRANSITION);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  next() {
    if (this.randomMode) {
      let idx;
      do {
        idx = Math.floor(Math.random() * this.messages.length);
      } while (idx === this.currentIndex && this.messages.length > 1);
      this.currentIndex = idx;
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.messages.length;
      if (this.currentIndex === 0) this._shuffleInPlace();
    }
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  toggleRandom() {
    this.randomMode = !this.randomMode;
    return this.randomMode;
  }

  _shuffle() {
    // Fisher-Yates shuffle, reset index for fresh start
    for (let i = this.messages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.messages[i], this.messages[j]] = [this.messages[j], this.messages[i]];
    }
    this.currentIndex = -1;
  }

  _shuffleInPlace() {
    // Fisher-Yates shuffle without touching currentIndex
    for (let i = this.messages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.messages[i], this.messages[j]] = [this.messages[j], this.messages[i]];
    }
  }

  _resetAutoRotation() {
    // Reset timer when user manually navigates
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        if (!this._paused && !this.board.isTransitioning) {
          this.next();
        }
      }, MESSAGE_INTERVAL + TOTAL_TRANSITION);
    }
  }
}
