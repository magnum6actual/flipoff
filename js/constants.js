// ── Configuration ──────────────────────────────────────────────────
// Primary config lives in config.json (grid, timing, messages, colors).
// The DEFAULTS below are fallbacks used only when config.json is missing.

const DEFAULTS = {
  grid: { cols: 22, rows: 5 },
  timing: {
    flipStepDuration: 130,
    flipStepFastDuration: 95,
    flipSettleDuration: 45,
    staggerDelay: 25,
    messageInterval: 5000,
    messageDurationSeconds: 4,
    apiMessageDurationSeconds: 30,
  },
  charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?\'/: ()',
  accentColors: [
    '#00FF7F', '#FF4D00', '#AA00FF',
    '#00AAFF', '#00FFCC',
  ],
  messages: [
    {'dynamic': 'datetime'},
    {'dynamic': 'weather'},
    ['', '🏛️ GOD IS IN', 'THE DETAILS .', '(LUDWIG MIES)', ''],
    ['', '🍎 STAY HUNGRY', 'STAY FOOLISH', '(STEVE JOBS)', ''],
    ['', '🎯 MAKE IT SIMPLE', 'BUT SIGNIFICANT', '(DON DRAPER)', ''],
  ],
};

// Load config.json — top-level await (blocks module graph execution)
let cfg = DEFAULTS;
let _configLoaded = false;
try {
  const res = await fetch(`config.json?_=${Date.now()}`);
  if (res.ok) {
    const json = await res.json();
    cfg = {
      ...DEFAULTS,
      ...json,
      grid: { ...DEFAULTS.grid, ...json.grid },
      timing: { ...DEFAULTS.timing, ...json.timing },
    };
    _configLoaded = true;
  }
} catch {
  // config.json missing or invalid — use defaults
}

export const CONFIG_LOADED = _configLoaded;

// ── Grid ───────────────────────────────────────────────────────────
export const GRID_COLS = cfg.grid.cols;
export const GRID_ROWS = cfg.grid.rows;

// ── Timing (split-flap animation) ─────────────────────────────────
export const FLIP_STEP_DURATION = cfg.timing.flipStepDuration;
export const FLIP_STEP_FAST_DURATION = cfg.timing.flipStepFastDuration;
export const FLIP_SETTLE_DURATION = cfg.timing.flipSettleDuration;
export const STAGGER_DELAY = cfg.timing.staggerDelay;
export const MESSAGE_INTERVAL = cfg.timing.messageInterval;
export const MIN_VISIBLE_FLIPS = 3;
export const MAX_VISIBLE_FLIPS = 10;

// Estimated total transition time — used for throttling (control panel, etc.)
export const TOTAL_TRANSITION =
  (MAX_VISIBLE_FLIPS * FLIP_STEP_DURATION) +
  (MAX_VISIBLE_FLIPS * FLIP_SETTLE_DURATION) + 500;

// ── Character sets & colors ───────────────────────────────────────
export const CHARSET = cfg.charset;
export const ACCENT_COLORS = cfg.accentColors;
export const MESSAGES = cfg.messages;

// Display-mode palettes (matrix / grayscale)
export const MATRIX_CHARSET =
  'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01';
export const MATRIX_COLORS = [
  '#00FF41', '#00CC33', '#00FF41',
  '#00FF88', '#003B00', '#00FF41',
];
export const GRAYSCALE_COLORS = [
  '#888888', '#AAAAAA', '#666666',
  '#CCCCCC', '#444444', '#AAAAAA',
];

// ── Backend defaults (used by RemoteMessageSync / server.py) ──────
export const DEFAULT_GRID_COLS = GRID_COLS;
export const DEFAULT_GRID_ROWS = GRID_ROWS;
export const DEFAULT_MESSAGE_DURATION_SECONDS = cfg.timing.messageDurationSeconds;
export const DEFAULT_API_MESSAGE_DURATION_SECONDS = cfg.timing.apiMessageDurationSeconds;
export const DEFAULT_MESSAGES = cfg.messages;
// Clone messages, preserving dynamic markers (objects like {"dynamic":"weather"})
function _cloneMessage(m) {
  return (m !== null && typeof m === 'object' && !Array.isArray(m)) ? m : [...m];
}

export const DEFAULT_DISPLAY_CONFIG = {
  cols: GRID_COLS,
  rows: GRID_ROWS,
  defaultMessages: cfg.messages.map(_cloneMessage),
  messageDurationSeconds: DEFAULT_MESSAGE_DURATION_SECONDS,
  apiMessageDurationSeconds: DEFAULT_API_MESSAGE_DURATION_SECONDS,
};
