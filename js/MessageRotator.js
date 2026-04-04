import { MESSAGE_INTERVAL, TOTAL_TRANSITION } from './constants.js';

export class MessageRotator {
  constructor(board, messages = []) {
    this.board = board;
    this.messages = messages;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this._displayInterval = MESSAGE_INTERVAL;
  }

  /** Replace the message pool and reset the position without stopping the timer. */
  setMessages(messages) {
    this.messages = messages;
    this.currentIndex = -1;
  }

  /** Set how long (ms) each message is held after its animation completes. */
  setDisplayInterval(ms) {
    this._displayInterval = Math.max(500, ms);
    this._resetAutoRotation();
  }

  /** Swap the underlying board (used after a resize-driven rebuild). */
  rebuild(board) {
    this.board = board;
    this.currentIndex = -1;
  }

  start() {
    // Show first message immediately
    this.next();

    // Begin auto-rotation
    this._timer = setInterval(() => {
      if (!this._paused && !this.board.isTransitioning) {
        this.next();
      }
    }, this._displayInterval + TOTAL_TRANSITION);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  next() {
    if (this.messages.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  prev() {
    if (this.messages.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex]);
    this._resetAutoRotation();
  }

  _resetAutoRotation() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = setInterval(() => {
        if (!this._paused && !this.board.isTransitioning) {
          this.next();
        }
      }, this._displayInterval + TOTAL_TRANSITION);
    }
  }
}
