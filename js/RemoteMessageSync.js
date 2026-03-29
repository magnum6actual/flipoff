export class RemoteMessageSync {
  constructor(onEvent, boardSlug = null) {
    this.onEvent = onEvent;
    this.routeBoardSlug = boardSlug;
    this.activeBoardSlug = boardSlug;
    this.ws = null;
    this.reconnectTimer = null;
    this.isStopped = false;
    this._backendAvailable = null; // null = unknown, true/false after first probe
    this._wsFailCount = 0;
  }

  async fetchConfig() {
    const config = await this._fetchJson(this._buildApiPath('/api/config', this.routeBoardSlug));
    if (config === null) {
      this._backendAvailable = false;
      return null;
    }
    this._backendAvailable = true;
    if (config.boardSlug) {
      this.activeBoardSlug = config.boardSlug;
    }
    return config;
  }

  fetchMessageState() {
    if (this._backendAvailable === false) return Promise.resolve(null);
    return this._fetchJson(this._buildApiPath('/api/message', this.activeBoardSlug || this.routeBoardSlug));
  }

  connect() {
    if (this._backendAvailable === false) return;
    if (!this._canUseNetwork() || this.isStopped) return;
    this._clearReconnect();

    // Close any existing socket before opening a new one
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this._getWebSocketUrl());
    } catch {
      this._backendAvailable = false;
      return;
    }

    const ws = this.ws;
    ws.addEventListener('open', () => {
      this._wsFailCount = 0;
    });
    ws.addEventListener('message', (event) => this._handleMessage(event));
    ws.addEventListener('close', () => {
      // Only reconnect if this is still the active socket
      if (this.ws === ws) this._scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      this._wsFailCount++;
      if (this.ws === ws) ws.close();
    });
  }

  stop() {
    this.isStopped = true;
    this._clearReconnect();
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if (data?.type && data?.payload) this.onEvent(data);
    } catch {}
  }

  _scheduleReconnect() {
    if (this.isStopped || this._backendAvailable === false || !this._canUseNetwork()) return;

    // After 3 consecutive failures, assume no backend and stop
    if (this._wsFailCount >= 3) {
      this._backendAvailable = false;
      return;
    }

    this._clearReconnect();
    this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
  }

  _clearReconnect() {
    if (this.reconnectTimer) { window.clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  _canUseNetwork() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  async _fetchJson(path) {
    if (!this._canUseNetwork()) return null;
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }

  _getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${this._buildApiPath('/ws', this.activeBoardSlug || this.routeBoardSlug)}`;
  }

  _buildApiPath(path, boardSlug) {
    if (!boardSlug) return path;
    return `${path}?board=${encodeURIComponent(boardSlug)}`;
  }
}
