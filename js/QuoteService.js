// DummyJSON — free, reliable, no key, no CORS issues, 1450+ quotes
// One bulk fetch; categories are filtered client-side by keyword
const DUMMYJSON_URL = 'https://dummyjson.com/quotes?limit=150';
// ZenQuotes fallback via CORS proxy
const ZENQUOTES_URL = 'https://zenquotes.io/api/quotes';
const CORS_PROXY    = 'https://api.allorigins.win/get?url=';

// Keywords used to bucket quotes into categories client-side
const CATEGORY_KEYWORDS = {
  motivation: ['dream','achiev','motiv','inspir','courage','believe','possible','effort','persist','determin','never give','push','strength','brave','endure','rise','overcome'],
  wisdom:     ['wisdom','knowledge','truth','learn','understand','mind','think','teach','fool','ignorance','experience','insight','reflect','patience','virtue','humble'],
  humor:      ['laugh','fun','joke','humor','smile','enjoy','comedy','amusing','absurd','ridicul','silly','hilarious','sarcas'],
  design:     ['beauty','art','creat','design','craft','aesthetic','form','style','vision','imagination','express','artist'],
  life:       ['life','live','journey','path','time','moment','death','age','human','soul','heart','love','family','world','exist','meaning'],
  technology: ['technolog','science','future','computer','code','data','innovat','engineer','digital','machine','inventor','progress','research'],
  success:    ['success','win','victor','achiev','accomplish','wealth','rich','goal','ambition','excel','leader','great','champion','prosper'],
};

// Shown while an API fetch is in progress
const LOADING_MESSAGE = [['LOADING', 'QUOTES...']];

export class QuoteService {
  constructor() {
    this.currentCategory = 'all';
    this._rawAll    = null;   // [{text, author}] — fetched once, all quotes
    this._rawBycat  = {};     // cat → [{text, author}] filtered pool
    this._fetching  = false;
    this.onUpdate   = null;   // callback(cat) when quotes arrive
  }

  start() {
    this._fetchAll();
  }

  setCategory(cat) {
    this.currentCategory = cat;
    if (this._rawAll && !this._rawBycat[cat]) {
      this._buildRawCache(cat);
    }
  }

  /**
   * Returns formatted message arrays for the current category,
   * word-wrapped to fit the given grid column count.
   * cols defaults to 22 (widest normal grid).
   */
  getMessages(cols = 22) {
    const raw = this._rawBycat[this.currentCategory];
    if (!raw) return LOADING_MESSAGE;
    // Body lines that comfortably fit: allow more lines on narrow grids
    const maxBodyLines = cols <= 12 ? 5 : cols <= 16 ? 4 : 4;
    return raw
      .map(({ text, author }) => this._format(text, author, cols, maxBodyLines))
      .filter(Boolean);
  }

  // ── Bulk fetch ────────────────────────────────────────────────────────────

  async _fetchAll() {
    if (this._fetching) return;
    this._fetching = true;
    try {
      const raw =
        await this._fromDummyJSON().catch(() => null) ||
        await this._fromZenQuotes().catch(() => null);

      if (raw && raw.length > 0) {
        this._rawAll = raw;
        const cats = ['all', 'motivation', 'wisdom', 'humor', 'design', 'life', 'technology', 'success'];
        cats.forEach(c => this._buildRawCache(c));
      } else {
        this._rawBycat[this.currentCategory] = null; // triggers ERROR in getMessages
      }
    } catch (err) {
      console.warn('[QuoteService] All APIs failed:', err.message);
    } finally {
      this._fetching = false;
      if (this.onUpdate) this.onUpdate(this.currentCategory);
    }
  }

  _buildRawCache(cat) {
    if (!this._rawAll) return;
    if (cat === 'all') {
      this._rawBycat.all = this._rawAll;
      return;
    }
    const keywords = CATEGORY_KEYWORDS[cat] || [];
    const filtered = this._rawAll.filter(({ text }) => {
      const t = text.toLowerCase();
      return keywords.some(kw => t.includes(kw));
    });
    this._rawBycat[cat] = filtered.length >= 5 ? filtered : this._rawAll;
  }

  // ── DummyJSON (primary) ───────────────────────────────────────────────────

  async _fromDummyJSON() {
    const resp = await _fetchWithTimeout(DUMMYJSON_URL, 7000);
    if (!resp.ok) throw new Error(`DummyJSON ${resp.status}`);
    const data = await resp.json();
    const list = Array.isArray(data) ? data : (data.quotes || []);
    const raw = list.map(q => ({
      text:   (q.quote || q.text || '').trim(),
      author: (q.author || 'Unknown').trim()
    })).filter(r => r.text.length >= 5);
    if (raw.length === 0) throw new Error('DummyJSON no usable quotes');
    return raw;
  }

  // ── ZenQuotes via allorigins CORS proxy (fallback) ────────────────────────

  async _fromZenQuotes() {
    const url  = CORS_PROXY + encodeURIComponent(ZENQUOTES_URL);
    const resp = await _fetchWithTimeout(url, 7000);
    if (!resp.ok) throw new Error(`ZenQuotes proxy ${resp.status}`);
    const wrapper = await resp.json();
    const list    = JSON.parse(wrapper.contents);
    if (!Array.isArray(list)) throw new Error('Bad ZenQuotes shape');
    const raw = list.map(q => ({
      text:   (q.q || '').trim(),
      author: (q.a || 'Unknown').trim()
    })).filter(r => r.text.length >= 5);
    if (raw.length === 0) throw new Error('ZenQuotes no usable quotes');
    return raw;
  }

  // ── Formatter (cols-aware) ────────────────────────────────────────────────

  _format(text, author, cols, maxBodyLines) {
    const clean = text
      .toUpperCase()
      .replace(/[^A-Z0-9 .,!?'\-:/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const authorClean = author
      .toUpperCase()
      .replace(/[^A-Z0-9 .,!?'\-:/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length < 5) return null;

    const attr      = ('- ' + authorClean).slice(0, cols);
    const bodyLines = _wrapWords(clean, cols, maxBodyLines);
    if (bodyLines.length === 0) return null;

    return [...bodyLines, attr];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function _wrapWords(text, maxLen, maxLines) {
  const words = text.split(' ').filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const w = word.slice(0, maxLen);
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxLen) {
      current += ' ' + w;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) break;
      current = w;
    }
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

