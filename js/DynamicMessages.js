import { GRID_COLS, GRID_ROWS } from './constants.js';

// ── Date/Time ─────────────────────────────────────────────────────

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

const DATETIME_COLOR = '#FFCC00'; // airport-board yellow

function datetimeMessage() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const day = DAYS[now.getDay()];
  const date = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const tz = formatTimezone();

  return {
    lines: [`🕐 ${hh}:${mm}:${ss}`, day, `📅 ${date}`, tz, ''].slice(0, GRID_ROWS),
    colors: [DATETIME_COLOR, DATETIME_COLOR, DATETIME_COLOR, DATETIME_COLOR, null],
  };
}

function formatTimezone() {
  const offset = new Date().getTimezoneOffset();
  if (offset === 0) return 'UTC';
  const sign = offset <= 0 ? '+' : '-';
  const absH = Math.floor(Math.abs(offset) / 60);
  const absM = Math.abs(offset) % 60;
  return absM === 0 ? `GMT${sign}${absH}` : `GMT${sign}${absH}:${String(absM).padStart(2, '0')}`;
}

// ── Weather ───────────────────────────────────────────────────────

let _weatherCache = null;
let _weatherFetchedAt = 0;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

const WMO_CODES = {
  0: 'CLEAR SKY', 1: 'MAINLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST',
  45: 'FOG', 48: 'RIME FOG',
  51: 'LIGHT DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE',
  61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
  66: 'FREEZING RAIN', 67: 'HEAVY FREEZING RAIN',
  71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW', 77: 'SNOW GRAINS',
  80: 'LIGHT SHOWERS', 81: 'SHOWERS', 82: 'HEAVY SHOWERS',
  85: 'LIGHT SNOW SHOWERS', 86: 'HEAVY SNOW SHOWERS',
  95: 'THUNDERSTORM', 96: 'THUNDERSTORM W/ HAIL', 99: 'SEVERE THUNDERSTORM',
};

// Country code → flag emoji (regional indicator symbols)
function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const offset = 0x1F1E6 - 65; // 'A' = 65
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}

// Country code → full name via Intl.DisplayNames
function countryName(code) {
  if (!code) return '';
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (names.of(code) || code).toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

// Temperature → color (blue at -10C or below, red at 40C or above)
// Gradient: blue → cyan → green → yellow → orange → red
function tempColor(temp) {
  const clamped = Math.max(-10, Math.min(40, temp));
  const t = (clamped + 10) / 50; // 0 = cold, 1 = hot

  const stops = [
    [0x00, 0xAA, 0xFF], // blue    (-10C)
    [0x00, 0xFF, 0xCC], // cyan    (0C)
    [0x00, 0xFF, 0x7F], // green   (10C)
    [0xFF, 0xCC, 0x00], // yellow  (20C)
    [0xFF, 0x88, 0x00], // orange  (30C)
    [0xFF, 0x2D, 0x00], // red     (40C)
  ];

  const segment = t * (stops.length - 1);
  const i = Math.min(Math.floor(segment), stops.length - 2);
  const local = segment - i;
  return lerpColor(...stops[i], ...stops[i + 1], local);
}

function lerpColor(r1, g1, b1, r2, g2, b2, t) {
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

let _weatherAbort = null;

async function fetchWeather() {
  if (_weatherCache && (Date.now() - _weatherFetchedAt < WEATHER_CACHE_MS)) {
    return _weatherCache;
  }

  // Cancel any in-flight weather request
  _weatherAbort?.abort();
  _weatherAbort = new AbortController();
  const { signal } = _weatherAbort;

  try {
    const geoRes = await fetch('https://ipapi.co/json/', { signal });
    const geo = await geoRes.json();
    const lat = geo.latitude;
    const lon = geo.longitude;
    const city = (geo.city || 'UNKNOWN').toUpperCase();
    const cc = (geo.country_code || '').toUpperCase();
    const flag = countryFlag(cc);
    const fullCountry = countryName(cc);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
    const weatherRes = await fetch(url, { signal });
    const weather = await weatherRes.json();

    const temp = Math.round(weather.current.temperature_2m);
    const unit = (weather.current_units?.temperature_2m || 'C').replace('°', '');
    const code = weather.current.weather_code;
    const condition = WMO_CODES[code] || 'UNKNOWN';

    _weatherCache = { city, flag, fullCountry, temp, unit, condition };
    _weatherFetchedAt = Date.now();
    return _weatherCache;
  } catch {
    return null;
  }
}

function weatherMessage() {
  const w = _weatherCache;
  if (!w) {
    return {
      lines: ['', '', 'LOADING WEATHER...', '', ''],
      colors: null,
    };
  }

  const color = tempColor(w.temp);
  const countryLine = w.flag ? `${w.flag} ${w.fullCountry}` : w.fullCountry;

  return {
    lines: [fit(w.city), fit(countryLine), `${w.temp} ${w.unit}`, fit(w.condition), ''].slice(0, GRID_ROWS),
    colors: [null, null, color, color, null],
  };
}

function fit(str) {
  return str.length > GRID_COLS ? str.slice(0, GRID_COLS) : str;
}

// ── Registry ──────────────────────────────────────────────────────

const DYNAMIC_PROVIDERS = {
  datetime: { generate: datetimeMessage },
  weather:  { generate: weatherMessage, init: fetchWeather },
};

export function isDynamicMarker(entry) {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.dynamic === 'string';
}

export function resolveDynamic(entry) {
  if (!isDynamicMarker(entry)) return entry;
  const provider = DYNAMIC_PROVIDERS[entry.dynamic];
  if (!provider) return { lines: ['', '', `UNKNOWN: ${entry.dynamic}`, '', ''], colors: null };
  return provider.generate();
}

export async function initDynamicProviders(messages) {
  const needed = new Set();
  for (const msg of messages) {
    if (isDynamicMarker(msg)) needed.add(msg.dynamic);
  }

  const inits = [];
  for (const key of needed) {
    const provider = DYNAMIC_PROVIDERS[key];
    if (provider?.init) inits.push(provider.init());
  }

  if (inits.length > 0) await Promise.allSettled(inits);
}

let _weatherRefreshTimer = null;
export function startWeatherRefresh() {
  if (_weatherRefreshTimer) return;
  _weatherRefreshTimer = setInterval(() => fetchWeather(), WEATHER_CACHE_MS);
}
