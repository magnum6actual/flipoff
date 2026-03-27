export const DEFAULT_GRID_COLS = 18;
export const DEFAULT_GRID_ROWS = 5;
export const DEFAULT_MESSAGE_DURATION_SECONDS = 4;
export const DEFAULT_API_MESSAGE_DURATION_SECONDS = 30;

export const SCRAMBLE_DURATION = 800;
export const FLIP_DURATION = 300;
export const STAGGER_DELAY = 25;
export const TOTAL_TRANSITION = 3800;
export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?\'/: ';

export const SCRAMBLE_COLORS = [
  '#00AAFF', '#00FFCC', '#AA00FF',
  '#FF2D00', '#FFCC00', '#FFFFFF'
];

export const ACCENT_COLORS = [
  '#00FF7F', '#FF4D00', '#AA00FF',
  '#00AAFF', '#00FFCC'
];

export const DEFAULT_MESSAGES = [
  [
    '',
    'GOD IS IN',
    'THE DETAILS .',
    '- LUDWIG MIES',
    ''
  ],
  [
    '',
    'STAY HUNGRY',
    'STAY FOOLISH',
    '- STEVE JOBS',
    ''
  ],
  [
    '',
    'GOOD DESIGN IS',
    'GOOD BUSINESS',
    '- THOMAS WATSON',
    ''
  ],
  [
    '',
    'LESS IS MORE',
    '',
    '- MIES VAN DER',
    'ROHE'
  ],
  [
    '',
    'MAKE IT SIMPLE',
    'BUT SIGNIFICANT',
    '- DON DRAPER',
    ''
  ],
  [
    '',
    'HAVE NO FEAR OF',
    'PERFECTION',
    '- SALVADOR DALI',
    ''
  ]
];

export const DEFAULT_DISPLAY_CONFIG = {
  cols: DEFAULT_GRID_COLS,
  rows: DEFAULT_GRID_ROWS,
  defaultMessages: DEFAULT_MESSAGES.map((message) => [...message]),
  messageDurationSeconds: DEFAULT_MESSAGE_DURATION_SECONDS,
  apiMessageDurationSeconds: DEFAULT_API_MESSAGE_DURATION_SECONDS,
};
