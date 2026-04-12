export const CONFIG_VERSION = 1;
export const CONFIG_STORAGE_KEY = 'flipoff.runtime.config.v1';
export const CONFIG_BROADCAST_CHANNEL = 'flipoff.runtime.config.channel';

export const SOUND_PROFILES = ['soft', 'authentic', 'joke', 'mute'];

export const FLIP_CHARACTER_ORDER = [
  ' ',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '.', ',', '-', '!', '?', '\'', '/', ':', '&', '@', '+', '#'
];

export const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  messages: {
    intervalMs: 4000,
    items: [
      { id: 'msg-1', lines: ['', 'GOD IS IN', 'THE DETAILS .', '- LUDWIG MIES', ''] },
      { id: 'msg-2', lines: ['', 'STAY HUNGRY', 'STAY FOOLISH', '- STEVE JOBS', ''] },
      { id: 'msg-3', lines: ['', 'GOOD DESIGN IS', 'GOOD BUSINESS', '- THOMAS WATSON', ''] },
      { id: 'msg-4', lines: ['', 'LESS IS MORE', '', '- MIES VAN DER ROHE', ''] },
      { id: 'msg-5', lines: ['', 'MAKE IT SIMPLE', 'BUT SIGNIFICANT', '- DON DRAPER', ''] },
      { id: 'msg-6', lines: ['', 'HAVE NO FEAR OF', 'PERFECTION', '- SALVADOR DALI', ''] }
    ]
  },
  grid: {
    cols: 22,
    rows: 5
  },
  timing: {
    flipDurationMs: 135,
    staggerDelayMs: 24,
    settleDelayMs: 160,
    maxOrderedSteps: 18
  },
  theme: {
    stepColors: ['#00AAFF', '#00FFCC', '#AA00FF', '#FF2D00', '#FFCC00', '#FFFFFF'],
    accentColors: ['#00FF7F', '#FF4D00', '#AA00FF', '#00AAFF', '#00FFCC']
  },
  sound: {
    profile: 'soft',
    volume: 0.8
  },
  remote: {
    enabled: false,
    url: '',
    authToken: '',
    pollIntervalMs: 15000
  }
};
