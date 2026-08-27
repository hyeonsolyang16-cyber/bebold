const express = require('express');

const router = express.Router();

const CACHE_TTL = 10 * 1000; // 10s
const cache = new Map(); // key -> { data, expires }

function getCache(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

const POPULAR = [
  { symbol: '005930.KS', name: '삼성전자' },
  { symbol: '000660.KS', name: 'SK하이닉스' },
  { symbol: '035420.KS', name: 'NAVER' },
  { symbol: '035720.KS', name: '카카오' },
  { symbol: '005380.KS', name: '현대차' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
];

function nameForSymbol(symbol) {
  const found = POPULAR.find((s) => s.symbol === symbol);
  return found ? found.name : symbol;
}

// deterministic-ish seed from symbol string
function seedFromSymbol(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return h;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePriceForSymbol(symbol) {
  const rand = mulberry32(seedFromSymbol(symbol));
  const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ');
  if (isKR) {
    return Math.floor(10000 + rand() * 190000);
  }
  return Math.round((20 + rand() * 480) * 100) / 100;
}

function mockQuote(symbol) {
  const rand = mulberry32(seedFromSymbol(symbol) ^ Math.floor(Date.now() / 30000));
  const base = basePriceForSymbol(symbol);
  const changePct = (rand() - 0.5) * 6; // -3% ~ +3%
  const price = Math.max(1, base * (1 + changePct / 100));
  const prevClose = base;
  return {
    symbol,
    name: nameForSymbol(symbol),
    price: Math.round(price * 100) / 100,
    prevClose: Math.round(prevClose * 100) / 100,
    change: Math.round((price - prevClose) * 100) / 100,
    changePercent: Math.round(changePct * 100) / 100,
    currency: symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? 'KRW' : 'USD',
    marketState: 'REGULAR',
    mock: true,
  };
}

function mockHistory(symbol, range, interval) {
  const days = rangeToDays(range);
  const rand = mulberry32(seedFromSymbol(symbol));
  let price = basePriceForSymbol(symbol) * 0.9;
  const candles = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (let i = days; i >= 0; i--) {
    const drift = (rand() - 0.48) * 0.02;
    const open = price;
    price = Math.max(1, price * (1 + drift));
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.01);
    const low = Math.min(open, close) * (1 - rand() * 0.01);
    candles.push({
      date: new Date(now - i * dayMs).toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.floor(rand() * 1000000),
    });
  }
  return { symbol, range, interval, candles, mock: true };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function rangeToDays(range) {
  switch (range) {
    case '5d':
      return 5;
    case '1mo':
      return 30;
    case '3mo':
      return 90;
    case '6mo':
      return 180;
    case '1y':
      return 365;
    default:
      return 90;
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeBoldClone/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: [] });
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
    const data = await fetchWithTimeout(url, 4000);
    const results = (data.quotes || [])
      .filter((item) => item.symbol)
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange,
        type: item.quoteType,
      }));
    const payload = { results, mock: false };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    const lower = q.toLowerCase();
    const results = POPULAR.filter(
      (s) => s.symbol.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower)
    );
    if (results.length === 0) {
      results.push({ symbol: q.toUpperCase(), name: q.toUpperCase() });
    }
    const payload = { results, mock: true };
    setCache(cacheKey, payload);
    res.json(payload);
  }
});

router.get('/quote/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const cacheKey = `quote:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const data = await fetchWithTimeout(url, 4000);
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) throw new Error('no result');
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    const payload = {
      symbol,
      name: meta.symbol,
      price: round2(price),
      prevClose: round2(prevClose),
      change: round2(change),
      changePercent: round2(changePercent),
      currency: meta.currency,
      marketState: meta.marketState,
      mock: false,
    };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    const payload = mockQuote(symbol);
    setCache(cacheKey, payload);
    res.json(payload);
  }
});

router.get('/history/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const range = (req.query.range || '3mo').toString();
  const interval = (req.query.interval || '1d').toString();
  const cacheKey = `history:${symbol}:${range}:${interval}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?range=${range}&interval=${interval}`;
    const data = await fetchWithTimeout(url, 4000);
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) throw new Error('no result');
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    const candles = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: quote.open[i] != null ? round2(quote.open[i]) : null,
      high: quote.high[i] != null ? round2(quote.high[i]) : null,
      low: quote.low[i] != null ? round2(quote.low[i]) : null,
      close: quote.close[i] != null ? round2(quote.close[i]) : null,
      volume: quote.volume[i],
    })).filter((c) => c.close != null);
    if (candles.length === 0) throw new Error('empty candles');
    const payload = { symbol, range, interval, candles, mock: false };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    const payload = mockHistory(symbol, range, interval);
    setCache(cacheKey, payload);
    res.json(payload);
  }
});

// Internal helper for other routes (trades/ranking) to get a current price
// without going through HTTP. Uses the same cache + fallback logic.
async function getQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const data = await fetchWithTimeout(url, 4000);
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) throw new Error('no result');
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const change = price - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    const payload = {
      symbol,
      name: meta.symbol,
      price: round2(price),
      prevClose: round2(prevClose),
      change: round2(change),
      changePercent: round2(changePercent),
      currency: meta.currency,
      marketState: meta.marketState,
      mock: false,
    };
    setCache(cacheKey, payload);
    return payload;
  } catch (err) {
    const payload = mockQuote(symbol);
    setCache(cacheKey, payload);
    return payload;
  }
}

module.exports = { router, mockQuote, POPULAR, getQuote };
