import { DEFAULT_MESSAGES, TOTAL_TRANSITION } from './constants.js';

const DEFAULT_MESSAGE_DURATION_SECONDS = 4;

export class MessageRotator {
  constructor(board, { messages = DEFAULT_MESSAGES, messageDurationSeconds = DEFAULT_MESSAGE_DURATION_SECONDS } = {}) {
    this.board = board;
    this.messages = messages.map((message) => [...message]);
    this.messageDurationSeconds = Number(messageDurationSeconds) || DEFAULT_MESSAGE_DURATION_SECONDS;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this._remoteOverride = false;
  }

  start({ immediate = true } = {}) {
    if (immediate) {
      this.next();
    }

    this._paused = false;
    this._ensureTimer();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  next(options = {}) {
    if (this._remoteOverride || this.messages.length === 0) return;

    this.currentIndex = (this.currentIndex + 1) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex], options);
    this._resetAutoRotation();
  }

  prev(options = {}) {
    if (this._remoteOverride || this.messages.length === 0) return;

    this.currentIndex = (this.currentIndex - 1 + this.messages.length) % this.messages.length;
    this.board.displayMessage(this.messages[this.currentIndex], options);
    this._resetAutoRotation();
  }

  setMessages(messages) {
    this.messages = Array.isArray(messages) ? messages.map((message) => [...message]) : [];
    if (this.currentIndex >= this.messages.length) {
      this.currentIndex = -1;
    }
  }

  setBoard(board) {
    this.board = board;
  }

  setMessageDurationSeconds(messageDurationSeconds) {
    this.messageDurationSeconds = Number(messageDurationSeconds) || DEFAULT_MESSAGE_DURATION_SECONDS;
    this._resetAutoRotation();
  }

  getCurrentMessage() {
    if (this.currentIndex < 0 || this.currentIndex >= this.messages.length) {
      return null;
    }

    return [...this.messages[this.currentIndex]];
  }

  hasStarted() {
    return this._timer !== null || this.currentIndex !== -1;
  }

  enableRemoteOverride() {
    this._remoteOverride = true;
    this._paused = true;
  }

  disableRemoteOverride({ showNextMessage = true, interrupt = false } = {}) {
    this._remoteOverride = false;
    this._paused = false;
    this._ensureTimer();

    if (showNextMessage) {
      this.next({ interrupt });
      return;
    }

    this._resetAutoRotation();
  }

  _ensureTimer() {
    if (this._timer) return;

    this._timer = setInterval(() => {
      if (!this._paused && !this.board.isTransitioning) {
        this.next();
      }
    }, (this.messageDurationSeconds * 1000) + TOTAL_TRANSITION);
  }

  _resetAutoRotation() {
    // Reset timer when user manually navigates
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      this._ensureTimer();
    }
  }
}
