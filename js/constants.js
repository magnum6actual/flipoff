export const GRID_COLS = 22;
export const GRID_ROWS = 5;

export const SCRAMBLE_DURATION = 800;
export const FLIP_DURATION = 300;
export const STAGGER_DELAY = 25;
export const TOTAL_TRANSITION = 3800;
export const MESSAGE_INTERVAL = 5000;

export const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?\'/: ';

// Matrix mode: katakana + binary + glitch symbols
export const MATRIX_CHARSET = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ01';

export const SCRAMBLE_COLORS = [
  '#00AAFF', '#00FFCC', '#AA00FF',
  '#FF2D00', '#FFCC00', '#FFFFFF'
];

export const MATRIX_COLORS = [
  '#00FF41', '#00CC33', '#00FF41',
  '#00FF88', '#003B00', '#00FF41'
];

export const GRAYSCALE_COLORS = [
  '#888888', '#AAAAAA', '#666666',
  '#CCCCCC', '#444444', '#AAAAAA'
];

export const ACCENT_COLORS = [
  '#00FF7F', '#FF4D00', '#AA00FF',
  '#00AAFF', '#00FFCC'
];

export const MESSAGES = [
  ['', '', 'NGMI', '', ''],
  ['', '', 'NOT YOUR KEYS', 'NOT YOUR COINS', ''],
  ['', '', 'THE PRINTER', 'GOES BRRR', ''],
  ['', '', 'PERMISSIONLESS', 'OR POINTLESS', ''],
  ['', '', 'BUILD THINGS', 'NOT ARGUMENTS', ''],
  ['', '', 'DONT TRUST', 'VERIFY', ''],
  ['', '', 'THE AUSTRIANS', 'WERE RIGHT', ''],

  ['', '', 'FREEDOM IS BUILT', 'NOT GIVEN', ''],
  ['', '', 'BE EARLY OR', 'BE SORRY', ''],
  ['', '', 'STACK SATS', 'STAY HUMBLE', ''],
  ['', '', 'FIXED SUPPLY', 'DO THE MATH', ''],
  ['', '', 'THE FED CANNOT', 'PRINT COURAGE', ''],
  ['', '', 'AGENTS ALL THE', 'WAY DOWN', ''],
  ['', '', 'AN AI WROTE THIS', '', ''],
  ['', '', 'I AM NOT A', 'FINANCIAL ADVISOR', ''],
  ['', '', 'GERUDO ONLINE', 'ALL SYSTEMS GO', ''],
  ['', '', 'SOUND MONEY IS', 'A HUMAN RIGHT', ''],
  ['', '', 'SCARCITY IS', 'THE FEATURE', ''],
  ['', '', 'CONSENSUS IS THE', 'ENEMY OF GAINS', ''],
  ['', '', 'DEBT IS FUTURE', 'SLAVERY', ''],
  ['', '', 'FIAT IS A RENTAL', 'BITCOIN IS OWNED', ''],
  ['', '', 'YOUR SAVINGS ARE', 'THEIR STIMULUS', ''],
  ['', '', 'INFLATION IS', 'TAXATION', ''],
  ['', '', 'THE REVOLUTION', 'WILL NOT BE CUSTODIED', ''],
  ['', '', 'NOBODY IS COMING', 'TO SAVE YOU', ''],
  ['', '', 'TIME CANT', 'BE PRINTED', ''],

  ['', '', 'PETER SCHIFF WAS', 'ALMOST RIGHT', ''],
  ['', '', 'VOLATILITY IS', 'THE PRICE OF UPSIDE', ''],
  ['', '', 'MONEY IS', 'STORED TIME', ''],
  ['', '', 'DONT WAIT FOR', 'PERMISSION', ''],
  ['', '', 'I LEFT THE DOLLAR', 'IT LEFT ME FIRST', ''],
  ['', '', 'THE MARKET IS', 'NEVER WRONG', ''],
  ['', '', 'REGULATION IS HOW', 'WINNERS CHEAT', ''],
  ['', '', 'EVERY CENTRAL', 'BANKER FAILED ECON', ''],
  ['', '', 'BUY BITCOIN', 'TELL NOBODY', ''],
  ['', '', 'HAVE YOU TRIED', 'TURNING IT OFF', ''],
  ['', '', 'COFFEE IS', 'INFRASTRUCTURE', ''],
  ['', '', 'CURIOSITY IS FREE', 'IGNORANCE COSTS', ''],
  ['', '', 'SOVEREIGNTY IS', 'PRACTICED NOT GIVEN', ''],
  ['', '', 'IF IT NEEDS A', 'MIDDLEMAN FIX IT', ''],
  ['', '', 'WORK HARDER ON', 'YOURSELF', ''],
  ['', '', 'FREEDOM ISNT A', 'POLITICAL POSITION', ''],
  ['', '', 'THE SAFEST RISK', 'IS YOUR OWN', ''],

  ['', '', 'DIVERSIFICATION IS', 'FOR THE UNCERTAIN', ''],
  ['', '', 'KEEP BUILDING', '', ''],
  ['', '', 'EMPIRE BUILDS ROADS', 'FREEDOM BUILDS WEALTH', ''],
  ['', '', 'YOUR BANK IS', 'LENDING YOUR MONEY', ''],
  ['', '', 'MOST PEOPLE', 'UNDERESTIMATE 10 YRS', ''],
  ['', '', 'NOBODY GOT FIRED', 'BUYING BTC AT 100K', ''],
  ['', '', 'DO NOT GO WHERE', 'THE PATH LEADS', ''],
  ['', '', 'THE BEST HEDGE', 'IS OWNERSHIP', ''],
  ['', '', 'DONT SELL YOUR', 'FUTURE FOR COMFORT', ''],
  ['', '', 'SCARCITY IS NOT', 'A BUG', ''],
  ['', '', 'WGMI', '', ''],
  ['', '', 'VENEZUELA HAD', 'A CENTRAL BANK TOO', ''],
  ['', '', 'TRUSTLESS BEATS', 'TRUSTED EVERY TIME', ''],
  ['', '', 'THE REVOLUTION', 'IS OPEN SOURCE', ''],
  ['', '', 'THE FUTURE BELONGS', 'TO THE CONSISTENT', ''],
  ['', '', 'CLARITY DOESNT', 'COME BEFORE ACTION', ''],
  ['', '', 'YOUR MARGIN IS', 'MY OPPORTUNITY', ''],
  ['', '', 'SHOW UP', 'EFFORT NEVER BETRAYS', ''],
  ['', 'WHEN SOMETHING IS', 'IMPORTANT ENOUGH', 'YOU DO IT ANYWAY', ''],
  ['', '', 'FAIL FAST', 'LEARN FASTER', ''],
  ['', '', 'LIFE IS TOO SHORT', 'FOR LONG MEETINGS', ''],
  ['', '', 'REUSE OR REDO', 'YOUR CHOICE', ''],
  ['', '', 'THE BEST PART', 'IS NO PART', ''],
  ['', '', 'THE LIMIT IS', 'PHYSICS NOT LAW', ''],
  ['', '', 'MULTIPLANETARY', 'OR EXTINCT', ''],
  ['', '', 'END THE FED', '', ''],
  ['', '', 'LIBERTY ONCE LOST', 'IS LOST FOREVER', ''],
  ['', '', 'TRUTH IS TREASON', 'IN AN EMPIRE OF LIES', ''],
  ['', 'DONT STEAL', 'THE GOVERNMENT', 'HATES COMPETITION', ''],
  ['', '', 'PEACE IS POPULAR', 'WAR IS NOT', ''],
  ['', '', 'FREEDOM IS POPULAR', '', ''],
  ['', '', 'THE DOLLAR WILL', 'EVENTUALLY COLLAPSE', ''],
  ['', 'THE QUESTION ISNT', 'WHO WILL LET ME', 'WHO WILL STOP ME', ''],
  ['', 'INDIVIDUAL RIGHTS', 'ARE NOT SUBJECT TO', 'A PUBLIC VOTE', ''],
  ['', 'THE SMALLEST MINORITY', 'ON EARTH IS', 'THE INDIVIDUAL', ''],
  ['', 'MONEY IS THE', 'BAROMETER OF A', 'SOCIETYS VIRTUE', ''],
  ['', 'NEVER LIVE FOR', 'THE SAKE OF', 'ANOTHER MAN', ''],
  ['', 'A CREATIVE MAN IS', 'MOTIVATED BY THE', 'DESIRE TO ACHIEVE', ''],
  ['', 'THE STATE IS A', 'GANG OF THIEVES', 'WRIT LARGE', ''],
  ['', 'TAXATION IS THEFT', 'PURELY AND SIMPLY', 'ON A GRAND SCALE', ''],
  ['', 'COMPASSION IS EASY', 'WHEN OTHERS ARE', 'FORCED TO PAY', ''],
  ['', 'WHAT THE STATE', 'FEARS MOST IS A', 'CHALLENGE TO ITS POWER', ''],
  ['', 'THE FREE MARKET', 'IS NOT A ZERO', 'SUM GAME', '']
];
