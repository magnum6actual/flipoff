export class MessageRotator {
  constructor(board) {
    this.board = board;
    this.messages = [];
    this.intervalMs = 4000;
    this.currentIndex = -1;
    this._timer = null;
    this._running = false;
  }

  applyConfig(config) {
    this.messages = config.messages.items;
    this.intervalMs = config.messages.intervalMs;

    if (!this.messages.length) {
      this.messages = [{ id: 'empty', lines: [''] }];
    }

    if (this.currentIndex >= this.messages.length) {
      this.currentIndex = 0;
    }
  }

  start() {
    this._running = true;
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    }
    this.showCurrent();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._running = false;
  }

  async showCurrent() {
    if (!this.messages.length) {
      return false;
    }

    const message = this.messages[this.currentIndex];
    const changed = await this.board.displayMessage(message.lines);
    this._scheduleNext();
    return changed;
  }

  async next() {
    if (!this.messages.length) {
      return false;
    }
    this.currentIndex = (this.currentIndex + 1) % this.messages.length;
    return this.showCurrent();
  }

  async prev() {
    if (!this.messages.length) {
      return false;
    }
    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    return this.showCurrent();
  }

  async refresh() {
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
    }
    return this.showCurrent();
  }

  _scheduleNext() {
    if (!this._running) {
      return;
    }

    if (this._timer) {
      clearTimeout(this._timer);
    }

    this._timer = setTimeout(() => {
      this.next();
    }, this.intervalMs);
  }
}
