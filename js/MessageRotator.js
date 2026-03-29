import { MESSAGES, MESSAGE_INTERVAL } from './constants.js';
import { isDynamicMarker, resolveDynamic } from './DynamicMessages.js';

const DEFAULT_MESSAGE_DURATION_SECONDS = Math.round(MESSAGE_INTERVAL / 1000);

export class MessageRotator {
  constructor(board, { messages = MESSAGES, messageDurationSeconds = DEFAULT_MESSAGE_DURATION_SECONDS } = {}) {
    this.board = board;
    this.messages = messages.map((m) => isDynamicMarker(m) ? m : [...m]);
    this.messageDurationSeconds = Number(messageDurationSeconds) || DEFAULT_MESSAGE_DURATION_SECONDS;
    this.currentIndex = -1;
    this._timer = null;
    this._paused = false;
    this._running = false;
    this._scheduleVersion = 0;
    this._remoteOverride = false;
    this._countdownStart = null;
    this._countdownDuration = null;

    // PR #1: Shuffle / random
    this.randomMode = false;
  }

  getCountdownProgress() {
    if (!this._countdownStart || !this._countdownDuration) return null;
    const elapsed = Date.now() - this._countdownStart;
    return Math.min(1, elapsed / this._countdownDuration);
  }

  start({ immediate = true } = {}) {
    this._running = true;
    this._paused = false;
    this._arrangeInitialOrder();
    if (immediate) {
      this.next();
    } else {
      this._scheduleNext();
    }
  }

  stop() {
    this._running = false;
    this._countdownStart = null;
    this._countdownDuration = null;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  next(options = {}) {
    if (this._remoteOverride || this.messages.length === 0) return false;
    return this._showMessage(1, options);
  }

  prev(options = {}) {
    if (this._remoteOverride || this.messages.length === 0) return false;
    return this._showMessage(-1, options);
  }

  // PR #1: Random mode
  toggleRandom() {
    this.randomMode = !this.randomMode;
    return this.randomMode;
  }

  // PR #2: Remote override support
  setMessages(messages) {
    this.messages = Array.isArray(messages) ? messages.map((m) => isDynamicMarker(m) ? m : [...m]) : [];
    if (this.currentIndex >= this.messages.length) {
      this.currentIndex = -1;
    }
  }

  setBoard(board) {
    this.board = board;
  }

  setMessageDurationSeconds(messageDurationSeconds) {
    this.messageDurationSeconds = Number(messageDurationSeconds) || DEFAULT_MESSAGE_DURATION_SECONDS;
  }

  getCurrentMessage() {
    if (this.currentIndex < 0 || this.currentIndex >= this.messages.length) {
      return null;
    }
    const entry = this.messages[this.currentIndex];
    const resolved = isDynamicMarker(entry) ? resolveDynamic(entry) : entry;
    return resolved.lines || [...resolved];
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

    if (showNextMessage) {
      this.next({ interrupt });
      return;
    }

    this._scheduleNext();
  }

  _showMessage(direction, options = {}) {
    if (this.board.isTransitioning && !options.interrupt) {
      return false;
    }

    let nextIndex;
    if (this.randomMode && direction > 0) {
      // PR #1: Random pick avoiding repeat
      do {
        nextIndex = Math.floor(Math.random() * this.messages.length);
      } while (nextIndex === this.currentIndex && this.messages.length > 1);
    } else {
      nextIndex = (this.currentIndex + direction + this.messages.length) % this.messages.length;
      // PR #1: Reshuffle when wrapping in sequential mode
      if (!this.randomMode && direction > 0 && nextIndex === 0 && this.currentIndex !== -1) {
        this._shuffleInPlace();
      }
    }

    // Resolve dynamic messages (datetime, weather, etc.) at display time
    const entry = this.messages[nextIndex];
    const resolved = isDynamicMarker(entry) ? resolveDynamic(entry) : entry;

    // Dynamic providers return { lines, colors }, static messages are plain arrays
    const lines = resolved.lines || resolved;
    const colors = resolved.colors || null;

    const transition = this.board.displayMessage(lines, { ...options, colors });

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

    this._countdownStart = null;
    this._countdownDuration = null;

    Promise.resolve(transition).finally(() => {
      if (!this._running || this._paused || scheduleVersion !== this._scheduleVersion) {
        return;
      }

      const duration = this.messageDurationSeconds * 1000;
      this._countdownStart = Date.now();
      this._countdownDuration = duration;

      this._timer = setTimeout(() => {
        this._countdownStart = null;
        this._countdownDuration = null;
        if (!this._paused) {
          this.next();
        }
      }, duration);
    });
  }

  _scheduleNext() {
    if (!this._running || this._paused) return;
    this._scheduleVersion += 1;
    const scheduleVersion = this._scheduleVersion;

    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    this._timer = setTimeout(() => {
      if (scheduleVersion === this._scheduleVersion && !this._paused) {
        this.next();
      }
    }, this.messageDurationSeconds * 1000);
  }

  // On first start: pin datetime at index 0, weather at index 1, shuffle the rest.
  // Subsequent cycles shuffle everything (including datetime/weather).
  _arrangeInitialOrder() {
    const datetime = this._extractDynamic('datetime');
    const weather = this._extractDynamic('weather');
    this._shuffleArray(this.messages);
    if (weather) this.messages.unshift(weather);
    if (datetime) this.messages.unshift(datetime);
    this.currentIndex = -1;
  }

  _extractDynamic(type) {
    const idx = this.messages.findIndex(
      m => isDynamicMarker(m) && m.dynamic === type
    );
    if (idx === -1) return null;
    return this.messages.splice(idx, 1)[0];
  }

  // Fisher-Yates shuffle
  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _shuffleInPlace() {
    this._shuffleArray(this.messages);
  }
}
