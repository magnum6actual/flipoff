import { CONFIG_VERSION, DEFAULT_CONFIG, SOUND_PROFILES } from './constants.js';

const PRIVATE_HOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})$/i;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asParsedInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asParsedFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asString(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  return String(value);
}

function sanitizeLine(value) {
  return asString(value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeColor(raw, fallback) {
  const value = asString(raw).trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toUpperCase();
  }
  return fallback;
}

function sanitizeColorList(rawList, fallbackList) {
  const list = Array.isArray(rawList) ? rawList : [];
  const sanitized = list
    .map((value, index) => sanitizeColor(value, fallbackList[index % fallbackList.length]))
    .filter((value, index, array) => value && array.indexOf(value) === index);

  return sanitized.length ? sanitized : [...fallbackList];
}

function sanitizeMessageItems(rawItems, fallbackItems) {
  const items = Array.isArray(rawItems) ? rawItems : fallbackItems;
  const sanitized = items
    .map((item, index) => {
      if (item && typeof item === 'object' && Array.isArray(item.lines)) {
        return {
          id: sanitizeLine(item.id) || `msg-${index + 1}`,
          lines: item.lines.map(sanitizeLine).slice(0, 12)
        };
      }

      if (Array.isArray(item)) {
        return {
          id: `msg-${index + 1}`,
          lines: item.map(sanitizeLine).slice(0, 12)
        };
      }

      if (typeof item === 'string') {
        return {
          id: `msg-${index + 1}`,
          lines: item.split(/\r?\n/).map(sanitizeLine).slice(0, 12)
        };
      }

      return null;
    })
    .filter(Boolean)
    .filter((item) => item.lines.some((line) => line.length > 0));

  return sanitized.length ? sanitized : deepClone(fallbackItems);
}

function sanitizeRemoteUrl(raw) {
  const value = asString(raw).trim();
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    if (url.protocol === 'https:') {
      return url.toString();
    }
    if (url.protocol === 'http:' && PRIVATE_HOST_PATTERN.test(url.hostname)) {
      return url.toString();
    }
  } catch (error) {
    return '';
  }

  return '';
}

function sanitizeRemoteSection(rawRemote, fallbackRemote) {
  const remote = rawRemote && typeof rawRemote === 'object' ? rawRemote : {};
  const url = sanitizeRemoteUrl(remote.url);

  return {
    enabled: Boolean(remote.enabled) && Boolean(url),
    url,
    authToken: asString(remote.authToken).trim().slice(0, 256),
    pollIntervalMs: clamp(Number.parseInt(remote.pollIntervalMs, 10) || fallbackRemote.pollIntervalMs, 5000, 300000)
  };
}

export function buildEditableConfig(rawConfig = {}) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const fallback = deepClone(DEFAULT_CONFIG);

  return {
    version: CONFIG_VERSION,
    messages: {
      intervalMs: clamp(asParsedInt(config?.messages?.intervalMs, fallback.messages.intervalMs), 1500, 120000),
      items: sanitizeMessageItems(config?.messages?.items, fallback.messages.items)
    },
    grid: {
      cols: clamp(asParsedInt(config?.grid?.cols, fallback.grid.cols), 8, 32),
      rows: clamp(asParsedInt(config?.grid?.rows, fallback.grid.rows), 1, 8)
    },
    timing: {
      flipDurationMs: clamp(asParsedInt(config?.timing?.flipDurationMs, fallback.timing.flipDurationMs), 70, 500),
      staggerDelayMs: clamp(asParsedInt(config?.timing?.staggerDelayMs, fallback.timing.staggerDelayMs), 0, 120),
      settleDelayMs: clamp(asParsedInt(config?.timing?.settleDelayMs, fallback.timing.settleDelayMs), 0, 1500),
      maxOrderedSteps: clamp(asParsedInt(config?.timing?.maxOrderedSteps, fallback.timing.maxOrderedSteps), 2, 40)
    },
    theme: {
      stepColors: sanitizeColorList(config?.theme?.stepColors, fallback.theme.stepColors),
      accentColors: sanitizeColorList(config?.theme?.accentColors, fallback.theme.accentColors)
    },
    sound: {
      profile: SOUND_PROFILES.includes(config?.sound?.profile) ? config.sound.profile : fallback.sound.profile,
      volume: clamp(asParsedFloat(config?.sound?.volume, fallback.sound.volume), 0, 1)
    },
    remote: sanitizeRemoteSection(config?.remote, fallback.remote)
  };
}

export function buildRemoteOverride(rawConfig = {}) {
  const editable = buildEditableConfig(rawConfig);
  return {
    version: editable.version,
    messages: editable.messages,
    grid: editable.grid,
    timing: editable.timing,
    theme: editable.theme,
    sound: editable.sound
  };
}

export function mergeConfigLayers(defaultConfig, localConfig, remoteConfig = null) {
  const localLayer = buildEditableConfig(localConfig || defaultConfig);
  if (!remoteConfig) {
    return localLayer;
  }

  const remoteLayer = buildRemoteOverride(remoteConfig);
  return {
    ...localLayer,
    messages: remoteLayer.messages || localLayer.messages,
    grid: remoteLayer.grid || localLayer.grid,
    timing: remoteLayer.timing || localLayer.timing,
    theme: remoteLayer.theme || localLayer.theme,
    sound: remoteLayer.sound || localLayer.sound,
    remote: localLayer.remote
  };
}

export function parseConfigPayload(text) {
  const parsed = JSON.parse(text);
  return buildEditableConfig(parsed);
}

export function isRemoteUrlTrusted(url) {
  return Boolean(sanitizeRemoteUrl(url));
}
