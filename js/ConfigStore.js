import {
  CONFIG_BROADCAST_CHANNEL,
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG
} from './constants.js';
import {
  buildEditableConfig,
  buildRemoteOverride,
  isRemoteUrlTrusted,
  mergeConfigLayers,
  parseConfigPayload
} from './configSchema.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class ConfigStore {
  constructor(options = {}) {
    this.applyRemoteOverrides = options.applyRemoteOverrides !== false;
    this.defaultConfig = clone(DEFAULT_CONFIG);
    this.localConfig = clone(DEFAULT_CONFIG);
    this.remoteConfig = null;
    this.listeners = new Set();
    this.broadcastChannel = null;
    this.pollTimer = null;
    this.remoteStatus = {
      state: 'disabled',
      message: 'Local defaults active',
      lastSuccessAt: null,
      lastErrorAt: null
    };
  }

  async init() {
    this.localConfig = this._loadLocalConfig();
    this._setupCrossTabSync();
    this._emit('init');
    this._restartRemotePolling();
  }

  destroy() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this._snapshot('subscribe'));
    return () => {
      this.listeners.delete(listener);
    };
  }

  getActiveConfig() {
    return mergeConfigLayers(
      this.defaultConfig,
      this.localConfig,
      this.applyRemoteOverrides ? this.remoteConfig : null
    );
  }

  getEditableConfig() {
    return buildEditableConfig(this.localConfig);
  }

  getRemoteStatus() {
    return { ...this.remoteStatus };
  }

  updateLocalConfig(config) {
    this.localConfig = buildEditableConfig(config);
    this._persistLocalConfig();
    this._restartRemotePolling();
    this._emit('local-update');
  }

  importLocalConfig(text) {
    const imported = parseConfigPayload(text);
    this.updateLocalConfig(imported);
    return imported;
  }

  resetLocalConfig() {
    this.updateLocalConfig(this.defaultConfig);
  }

  async refreshRemoteConfig() {
    const activeConfig = this.getEditableConfig();
    const remote = activeConfig.remote;

    if (!remote.enabled || !remote.url) {
      this.remoteConfig = null;
      this.remoteStatus = {
        state: 'disabled',
        message: 'Remote sync off',
        lastSuccessAt: null,
        lastErrorAt: null
      };
      this._emit('remote-disabled');
      return null;
    }

    if (!isRemoteUrlTrusted(remote.url)) {
      this.remoteConfig = null;
      this.remoteStatus = {
        state: 'error',
        message: 'Remote URL must be HTTPS or private-network HTTP',
        lastSuccessAt: this.remoteStatus.lastSuccessAt,
        lastErrorAt: Date.now()
      };
      this._emit('remote-error');
      return null;
    }

    try {
      const headers = {};
      if (remote.authToken) {
        headers.Authorization = `Bearer ${remote.authToken}`;
      }

      const response = await fetch(remote.url, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      this.remoteConfig = buildRemoteOverride(payload);
      this.remoteStatus = {
        state: 'ok',
        message: `Remote sync active at ${new Date().toLocaleTimeString()}`,
        lastSuccessAt: Date.now(),
        lastErrorAt: null
      };
      this._emit('remote-success');
      return this.remoteConfig;
    } catch (error) {
      this.remoteStatus = {
        state: 'error',
        message: `Remote sync failed: ${error.message}`,
        lastSuccessAt: this.remoteStatus.lastSuccessAt,
        lastErrorAt: Date.now()
      };
      this._emit('remote-error');
      return null;
    }
  }

  _loadLocalConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) {
        return buildEditableConfig(this.defaultConfig);
      }
      return buildEditableConfig(JSON.parse(raw));
    } catch (error) {
      return buildEditableConfig(this.defaultConfig);
    }
  }

  _persistLocalConfig() {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.localConfig));
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'config-updated' });
    }
  }

  _setupCrossTabSync() {
    window.addEventListener('storage', (event) => {
      if (event.key !== CONFIG_STORAGE_KEY) {
        return;
      }
      this.localConfig = this._loadLocalConfig();
      this._restartRemotePolling();
      this._emit('storage-sync');
    });

    if ('BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel(CONFIG_BROADCAST_CHANNEL);
      this.broadcastChannel.addEventListener('message', (event) => {
        if (event.data?.type !== 'config-updated') {
          return;
        }
        this.localConfig = this._loadLocalConfig();
        this._restartRemotePolling();
        this._emit('broadcast-sync');
      });
    }
  }

  _scheduleNextRemotePoll() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    const remote = this.getEditableConfig().remote;
    if (!this.applyRemoteOverrides || !remote.enabled || !remote.url) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.refreshRemoteConfig();
      this._scheduleNextRemotePoll();
    }, remote.pollIntervalMs);
  }

  _restartRemotePolling() {
    this._scheduleNextRemotePoll();
    if (this.applyRemoteOverrides) {
      this.refreshRemoteConfig();
    } else {
      this.remoteStatus = {
        state: 'disabled',
        message: 'Remote sync managed by display page',
        lastSuccessAt: null,
        lastErrorAt: null
      };
    }
  }

  _snapshot(source) {
    return {
      source,
      config: this.getActiveConfig(),
      editableConfig: this.getEditableConfig(),
      status: {
        remote: this.getRemoteStatus()
      }
    };
  }

  _emit(source) {
    const snapshot = this._snapshot(source);
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
