const CHANNEL_NAME = 'flipoff-control';

export class ControlChannel {
  constructor() {
    this._ch = new BroadcastChannel(CHANNEL_NAME);
    this._handlers = {};
    this._ch.onmessage = (e) => {
      const fn = this._handlers[e.data.type];
      if (fn) fn(e.data);
    };
  }

  on(type, fn) {
    this._handlers[type] = fn;
  }

  send(type, payload = {}) {
    this._ch.postMessage({ type, ...payload });
  }

  close() {
    this._ch.close();
  }
}
