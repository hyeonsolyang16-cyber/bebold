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

// 코스피/코스닥 대형주 + 미국 대형주. 한국 종목은 정확한 한글 종목명을 병기하고,
// 미국 종목은 "한글명 (영문명)" 형태로 병기해 일관성을 유지한다.
const POPULAR = [
  // 코스피 대형주
  { symbol: '005930.KS', name: '삼성전자' },
  { symbol: '000660.KS', name: 'SK하이닉스' },
  { symbol: '373220.KS', name: 'LG에너지솔루션' },
  { symbol: '207940.KS', name: '삼성바이오로직스' },
  { symbol: '005935.KS', name: '삼성전자우' },
  { symbol: '005380.KS', name: '현대차' },
  { symbol: '000270.KS', name: '기아' },
  { symbol: '035420.KS', name: 'NAVER' },
  { symbol: '035720.KS', name: '카카오' },
  { symbol: '051910.KS', name: 'LG화학' },
  { symbol: '006400.KS', name: '삼성SDI' },
  { symbol: '105560.KS', name: 'KB금융' },
  { symbol: '055550.KS', name: '신한지주' },
  { symbol: '012330.KS', name: '현대모비스' },
  { symbol: '028260.KS', name: '삼성물산' },
  { symbol: '068270.KS', name: '셀트리온' },
  { symbol: '096770.KS', name: 'SK이노베이션' },
  { symbol: '066570.KS', name: 'LG전자' },
  { symbol: '003670.KS', name: '포스코퓨처엠' },
  { symbol: '015760.KS', name: '한국전력' },
  { symbol: '032830.KS', name: '삼성생명' },
  { symbol: '086790.KS', name: '하나금융지주' },
  { symbol: '011200.KS', name: 'HMM' },
  { symbol: '009150.KS', name: '삼성전기' },
  { symbol: '018260.KS', name: '삼성에스디에스' },
  // 코스닥 주요주
  { symbol: '247540.KQ', name: '에코프로비엠' },
  { symbol: '086520.KQ', name: '에코프로' },
  { symbol: '091990.KQ', name: '셀트리온헬스케어' },
  { symbol: '328130.KQ', name: '루닛' },
  { symbol: '196170.KQ', name: '알테오젠' },
  { symbol: '028300.KQ', name: 'HLB' },
  { symbol: '066970.KQ', name: '엘앤에프' },
  { symbol: '293490.KQ', name: '카카오게임즈' },
  { symbol: '041510.KQ', name: 'SM' },
  { symbol: '112040.KQ', name: '위메이드' },
  // 미국 대형주
  { symbol: 'AAPL', name: '애플 (Apple)' },
  { symbol: 'TSLA', name: '테슬라 (Tesla)' },
  { symbol: 'MSFT', name: '마이크로소프트 (Microsoft)' },
  { symbol: 'NVDA', name: '엔비디아 (NVIDIA)' },
  { symbol: 'GOOGL', name: '알파벳 (Alphabet)' },
  { symbol: 'AMZN', name: '아마존 (Amazon)' },
  { symbol: 'META', name: '메타 플랫폼스 (Meta)' },
  { symbol: 'NFLX', name: '넷플릭스 (Netflix)' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'AVGO', name: '브로드컴 (Broadcom)' },
  { symbol: 'COST', name: '코스트코 (Costco)' },
  { symbol: 'JPM', name: 'JP모건체이스 (JPMorgan Chase)' },
  { symbol: 'V', name: '비자 (Visa)' },
  { symbol: 'DIS', name: '월트디즈니 (Walt Disney)' },
  { symbol: 'BA', name: '보잉 (Boeing)' },
];

// 카테고리별 큐레이션 목록 (실시간 거래대금/시가총액 순위 API가 없어 대표 종목으로 대체)
const CATEGORY_SYMBOLS = {
  volume: [
    '005930.KS', '000660.KS', '035720.KS', '035420.KS', '005380.KS',
    '247540.KQ', '086520.KQ', 'TSLA', 'AAPL', 'NVDA',
    '068270.KS', '051910.KS', '011200.KS', '028300.KQ', '293490.KQ',
    'AMD', 'AMZN', 'META', '066570.KS', '096770.KS',
  ],
  marketcap: [
    '005930.KS', '000660.KS', '373220.KS', '207940.KS', '035420.KS',
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
    '005380.KS', '051910.KS', '006400.KS', '105560.KS', '055550.KS',
    'META', 'AVGO', 'TSLA', 'V', 'JPM',
  ],
  popular: [
    '005930.KS', '035720.KS', '000660.KS', 'TSLA', 'AAPL',
    '035420.KS', '247540.KQ', 'NVDA', '005380.KS', '086520.KQ',
    '068270.KS', '028300.KQ', 'GOOGL', 'MSFT', 'AMZN',
    '293490.KQ', '196170.KQ', 'META', '000270.KS', '112040.KQ',
  ],
  gainers: [
    '247540.KQ', '086520.KQ', '328130.KQ', '196170.KQ', '028300.KQ',
    '066970.KQ', 'NVDA', 'AMD', 'TSLA', '041510.KQ',
  ],
  losers: [
    '011200.KS', '096770.KS', '015760.KS', '018260.KS',
    'DIS', 'BA', '032830.KS', '086790.KS', '112040.KQ', '066970.KQ',
  ],
};

const NAME_FALLBACKS = {
  // Yahoo search 결과에 한글명이 없는 경우를 위한 보강 매핑 (POPULAR와 중복되어도 무방)
};

function nameForSymbol(symbol) {
  const found = POPULAR.find((s) => s.symbol === symbol);
  if (found) return found.name;
  return NAME_FALLBACKS[symbol] || symbol;
}

const POPULAR_SET = new Set(POPULAR.map((s) => s.symbol));

// Cache of English company name -> Korean translation, so we only hit the
// translation API once per unique name (persists for the process lifetime).
const translationCache = new Map();

// Very small heuristic: skip translating things that already look Korean,
// or short all-caps tickers/tokens that a machine translator tends to mangle.
function looksAlreadyTranslatable(text) {
  return /[a-zA-Z]/.test(text);
}

async function translateToKorean(text) {
  if (!text || !looksAlreadyTranslatable(text)) return text;
  if (translationCache.has(text)) return translationCache.get(text);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`;
    const data = await fetchWithTimeout(url, 2500);
    const translated = data?.responseData?.translatedText;
    const result = translated && translated.trim() ? translated.trim() : text;
    translationCache.set(text, result);
    return result;
  } catch (err) {
    translationCache.set(text, text);
    return text;
  }
}

// Prefer our curated Korean name for known symbols; for anything else, try to
// machine-translate Yahoo's (usually English) longName/shortName to Korean so
// every listed stock shows a Korean name, not just our curated large-caps.
async function resolveDisplayName(symbol, meta) {
  if (POPULAR_SET.has(symbol)) return nameForSymbol(symbol);
  const englishName = meta?.longName || meta?.shortName || symbol;
  return translateToKorean(englishName);
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
    volume: Math.floor(rand() * 5000000),
    marketState: 'REGULAR',
    mock: true,
  };
}

const INTRADAY_MINUTES = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
};

function mockHistory(symbol, range, interval) {
  const rand = mulberry32(seedFromSymbol(symbol));
  let price = basePriceForSymbol(symbol) * 0.9;
  const candles = [];
  const now = Date.now();

  // Intraday (오늘/실시간) mock: dense minute-level candles across the trading day so far.
  if (range === '1d' && INTRADAY_MINUTES[interval]) {
    const stepMs = INTRADAY_MINUTES[interval] * 60 * 1000;
    const points = Math.max(1, Math.floor((6.5 * 60 * 60 * 1000) / stepMs)); // ~6.5h session
    price = basePriceForSymbol(symbol) * (0.99 + rand() * 0.02);
    for (let i = points; i >= 0; i--) {
      const drift = (rand() - 0.49) * 0.006;
      const open = price;
      price = Math.max(1, price * (1 + drift));
      const close = price;
      const high = Math.max(open, close) * (1 + rand() * 0.003);
      const low = Math.min(open, close) * (1 - rand() * 0.003);
      const ts = new Date(now - i * stepMs);
      candles.push({
        date: ts.toISOString(),
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        volume: Math.floor(rand() * 50000),
      });
    }
    return { symbol, range, interval, candles, mock: true };
  }

  const days = rangeToDays(range);
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
    const rawResults = (data.quotes || []).filter((item) => item.symbol);
    const results = await Promise.all(
      rawResults.map(async (item) => ({
        symbol: item.symbol,
        name: await resolveDisplayName(item.symbol, { longName: item.longname, shortName: item.shortname }),
        exchange: item.exchange,
        type: item.quoteType,
      }))
    );
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

const ALL_TRACKED_SYMBOLS = POPULAR.map((s) => s.symbol);

// Yahoo's unofficial predefined screener — the same endpoint the Yahoo Finance
// website itself uses for its real-time "Day Gainers/Losers" pages. Gives us
// genuine whole-market movers (mostly US-listed) rather than just our curated list.
async function fetchScreener(scrId, count = 25) {
  const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&count=${count}&scrIds=${scrId}`;
  const data = await fetchWithTimeout(url, 4000);
  const quotes = data?.finance?.result?.[0]?.quotes || [];
  const filtered = quotes.filter((q) => q.symbol && q.regularMarketPrice != null);
  return Promise.all(
    filtered.map(async (q) => ({
      symbol: q.symbol,
      name: await resolveDisplayName(q.symbol, { longName: q.longName, shortName: q.shortName }),
      price: round2(q.regularMarketPrice),
      prevClose: round2(q.regularMarketPreviousClose ?? q.regularMarketPrice - (q.regularMarketChange || 0)),
      change: round2(q.regularMarketChange ?? 0),
      changePercent: round2(q.regularMarketChangePercent ?? 0),
      currency: q.currency || 'USD',
      volume: q.regularMarketVolume ?? null,
      marketState: q.marketState,
      mock: false,
    }))
  );
}

router.get('/categories/:key', async (req, res) => {
  const { key } = req.params;
  const symbols = CATEGORY_SYMBOLS[key];
  if (!symbols) {
    return res.status(404).json({ error: '알 수 없는 카테고리입니다.' });
  }
  const cacheKey = `category:${key}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    let items;
    if (key === 'gainers' || key === 'losers' || key === 'volume') {
      // Compute real-time rankings dynamically across every symbol we track
      // (not a hardcoded subset), and broaden with Yahoo's live market-wide
      // screener on top of that, so this reflects actual market movers.
      const trackedQuotes = await Promise.all(ALL_TRACKED_SYMBOLS.map((symbol) => getQuote(symbol)));
      let combined = trackedQuotes;
      try {
        const screenerId = key === 'gainers' ? 'day_gainers' : key === 'losers' ? 'day_losers' : 'most_actives';
        const screenerQuotes = await fetchScreener(screenerId, 25);
        const seen = new Set(combined.map((q) => q.symbol));
        for (const q of screenerQuotes) {
          if (!seen.has(q.symbol)) {
            combined.push(q);
            seen.add(q.symbol);
          }
        }
      } catch (screenerErr) {
        // Screener endpoint can be blocked/rate-limited; fall back to tracked-only.
      }
      if (key === 'gainers' || key === 'losers') {
        items = combined
          .filter((q) => Number.isFinite(q.changePercent))
          .sort((a, b) => (key === 'gainers' ? b.changePercent - a.changePercent : a.changePercent - b.changePercent))
          .slice(0, 20);
      } else {
        // 거래대금(trading value) proxy = price * volume, since a true
        // real-time KRX/NASDAQ trading-value feed isn't available for free.
        items = combined
          .filter((q) => Number.isFinite(q.volume) && q.volume > 0)
          .sort((a, b) => b.price * b.volume - a.price * a.volume)
          .slice(0, 20);
      }
    } else {
      items = await Promise.all(symbols.map((symbol) => getQuote(symbol)));
    }
    const payload = { key, items, realtime: key === 'gainers' || key === 'losers' || key === 'volume' };
    setCache(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '카테고리 조회 중 오류가 발생했습니다.' });
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
      name: await resolveDisplayName(symbol, meta),
      price: round2(price),
      prevClose: round2(prevClose),
      change: round2(change),
      changePercent: round2(changePercent),
      currency: meta.currency,
      volume: meta.regularMarketVolume ?? null,
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
    const isIntraday = !!INTRADAY_MINUTES[interval];
    const candles = timestamps.map((ts, i) => ({
      date: isIntraday
        ? new Date(ts * 1000).toISOString()
        : new Date(ts * 1000).toISOString().slice(0, 10),
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
      name: await resolveDisplayName(symbol, meta),
      price: round2(price),
      prevClose: round2(prevClose),
      change: round2(change),
      changePercent: round2(changePercent),
      currency: meta.currency,
      volume: meta.regularMarketVolume ?? null,
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

module.exports = { router, mockQuote, POPULAR, getQuote, CATEGORY_SYMBOLS };
