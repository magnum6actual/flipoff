import { MESSAGES, MESSAGE_INTERVAL } from './constants.js';

export class MessageRotator {
  constructor(board) {
    this.board = board;
    this.messages = MESSAGES;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this._running = false;
    this._scheduleVersion = 0;
  }

  start() {
    this._running = true;
    this.next();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  next() {
    this._showMessage(1);
  }

  prev() {
    this._showMessage(-1);
  }

  _showMessage(direction) {
    if (this.board.isTransitioning || this.messages.length === 0) {
      return false;
    }

    const nextIndex = (this.currentIndex + direction + this.messages.length) % this.messages.length;
    const transition = this.board.displayMessage(this.messages[nextIndex]);

    if (!transition) {
      return false;
    }

    this.currentIndex = nextIndex;
    this._scheduleAfterTransition(transition);
    return true;
  }

  _scheduleAfterTransition(transition) {
    this._scheduleVersion += 1;
    const scheduleVersion = this._scheduleVersion;

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    Promise.resolve(transition).finally(() => {
      if (!this._running || this._paused || scheduleVersion !== this._scheduleVersion) {
        return;
      }

      this._timer = setTimeout(() => {
        if (!this._paused) {
          this.next();
        }
      }, MESSAGE_INTERVAL);
    });
  }
}
