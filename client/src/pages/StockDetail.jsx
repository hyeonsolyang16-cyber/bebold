import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, setUser as saveUser } from '../api/client.js';
import { useAuth } from '../App.jsx';
import CandleChart from '../components/CandleChart.jsx';
import AssetTrendChart from '../components/AssetTrendChart.jsx';

const QUOTE_POLL_MS = 2000;
const MAX_LIVE_POINTS = 60;

const RANGES = [
  { key: 'today', label: '오늘', apiRange: '1d', apiInterval: '5m' },
  { key: '1wk', label: '1주', apiRange: '5d', apiInterval: '1d' },
  { key: '1mo', label: '1개월', apiRange: '1mo', apiInterval: '1d' },
  { key: '3mo', label: '3개월', apiRange: '3mo', apiInterval: '1d' },
  { key: '1y', label: '1년', apiRange: '1y', apiInterval: '1d' },
];

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState('today');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myQty, setMyQty] = useState(0);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [livePoints, setLivePoints] = useState([]);
  const [priceFlash, setPriceFlash] = useState(null);
  const prevPriceRef = useRef(null);
  const symbolRef = useRef(symbol);

  useEffect(() => {
    symbolRef.current = symbol;
    setLivePoints([]);
    prevPriceRef.current = null;
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    async function load({ withHoldings } = { withHoldings: true }) {
      try {
        const tasks = [api.get(`/stocks/quote/${encodeURIComponent(symbol)}`)];
        if (withHoldings) tasks.push(api.get('/trades/holdings'));
        const [q, holdingsRes] = await Promise.all(tasks);
        if (cancelled || symbolRef.current !== symbol) return;
        setQuote(q);
        if (holdingsRes) {
          const holding = holdingsRes.holdings.find((h) => h.symbol === symbol);
          setMyQty(holding ? holding.qty : 0);
        }
        if (q?.price != null) {
          setLivePoints((prev) => [...prev, { t: Date.now(), value: q.price }].slice(-MAX_LIVE_POINTS));
          const prevPrice = prevPriceRef.current;
          if (prevPrice != null && q.price !== prevPrice) {
            setPriceFlash(q.price > prevPrice ? 'up' : 'down');
            setTimeout(() => setPriceFlash(null), 700);
          }
          prevPriceRef.current = q.price;
        }
      } catch (err) {
        console.error(err);
      }
    }
    load({ withHoldings: true });
    const interval = setInterval(() => load({ withHoldings: false }), QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    const rangeConfig = RANGES.find((r) => r.key === range) || RANGES[2];
    async function loadHistory() {
      try {
        const data = await api.get(
          `/stocks/history/${encodeURIComponent(symbol)}?range=${rangeConfig.apiRange}&interval=${rangeConfig.apiInterval}`
        );
        if (!cancelled) setHistory(data);
      } catch (err) {
        console.error(err);
      }
    }
    loadHistory();
    let interval;
    if (range === 'today') {
      interval = setInterval(loadHistory, 15000);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [symbol, range]);

  async function loadPendingOrders() {
    try {
      const res = await api.get('/trades/orders/pending');
      setPendingOrders((res.orders || []).filter((o) => o.symbol === symbol));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadPendingOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  async function refreshUser() {
    try {
      // cash is returned directly in trade response; here just refetch holdings for myQty
      const holdingsRes = await api.get('/trades/holdings');
      const holding = holdingsRes.holdings.find((h) => h.symbol === symbol);
      setMyQty(holding ? holding.qty : 0);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) {
      setError('수량을 입력해주세요.');
      return;
    }
    if (orderType === 'LIMIT' && (!limitPrice || Number(limitPrice) <= 0)) {
      setError('지정가를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const path = side === 'BUY' ? '/trades/buy' : '/trades/sell';
      const body =
        side === 'BUY'
          ? { symbol, name: quote?.name, qty: quantity, orderType, limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined }
          : { symbol, qty: quantity, orderType, limitPrice: orderType === 'LIMIT' ? Number(limitPrice) : undefined, name: quote?.name };
      const res = await api.post(path, body);
      if (res.pending) {
        const updatedUser = { ...user, cash: res.cash };
        setUser(updatedUser);
        saveUser(updatedUser);
        setMessage(side === 'BUY' ? '지정가 매수 주문이 접수되었습니다.' : '지정가 매도 주문이 접수되었습니다.');
        setQty('');
        setLimitPrice('');
        loadPendingOrders();
      } else {
        const updatedUser = { ...user, cash: res.cash };
        setUser(updatedUser);
        saveUser(updatedUser);
        setMessage(side === 'BUY' ? '매수가 완료되었습니다.' : '매도가 완료되었습니다.');
        setQty('');
      }
      refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelOrder(orderId) {
    try {
      const res = await api.post(`/trades/orders/${orderId}/cancel`, {});
      const updatedUser = { ...user, cash: res.cash };
      setUser(updatedUser);
      saveUser(updatedUser);
      loadPendingOrders();
      refreshUser();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!quote) {
    return <div className="spinner-wrap">불러오는 중...</div>;
  }

  const up = quote.changePercent >= 0;
  const isKR = quote.currency === 'KRW';

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: '4px 0', marginBottom: 8 }}>
        ← 뒤로
      </button>
      <div className="page-title">{quote.name || quote.symbol}</div>
      <div className="muted" style={{ marginTop: -12, marginBottom: 12 }}>{quote.symbol}</div>

      <div className="card">
        <div
          className={priceFlash ? `price-flash-${priceFlash}` : ''}
          style={{ fontSize: 26, fontWeight: 800, borderRadius: 8, display: 'inline-block' }}
        >
          {isKR ? `${Math.round(quote.price).toLocaleString()}원` : `$${quote.price.toFixed(2)}`}
        </div>
        <div className={up ? 'up' : 'down'} style={{ fontWeight: 700, marginTop: 4 }}>
          {up ? '▲' : '▼'} {Math.abs(quote.change).toFixed(2)} ({up ? '+' : ''}
          {quote.changePercent.toFixed(2)}%)
        </div>

        <div className="row" style={{ marginTop: 16, gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={`btn ${range === r.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1, padding: '8px 4px', fontSize: 12 }}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === 'today' && (
          <div className="row" style={{ alignItems: 'center', gap: 6, marginTop: 10 }}>
            <span className="live-dot" aria-hidden="true" />
            <span className="live-label">실시간</span>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {range === 'today' ? (
            <AssetTrendChart points={livePoints} height={160} />
          ) : (
            <CandleChart candles={history?.candles} currency={quote.currency} />
          )}
        </div>
      </div>

      <div className="section-title">주문하기</div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 12 }}>
          보유 현금: {Math.round(user?.cash ?? 0).toLocaleString()}원 · 보유 수량: {myQty}주
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button
            className={`btn ${side === 'BUY' ? 'btn-up' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setSide('BUY')}
            type="button"
          >
            매수
          </button>
          <button
            className={`btn ${side === 'SELL' ? 'btn-down' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setSide('SELL')}
            type="button"
          >
            매도
          </button>
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={`btn ${orderType === 'MARKET' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '6px 4px', fontSize: 13 }}
            onClick={() => setOrderType('MARKET')}
          >
            시장가
          </button>
          <button
            type="button"
            className={`btn ${orderType === 'LIMIT' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '6px 4px', fontSize: 13 }}
            onClick={() => setOrderType('LIMIT')}
          >
            지정가
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {orderType === 'LIMIT' && (
            <div className="form-group">
              <label className="form-label">지정가</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={`현재가 ${isKR ? Math.round(quote.price).toLocaleString() : quote.price.toFixed(2)}`}
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">수량</label>
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="수량 입력"
            />
          </div>
          {qty && (
            <div className="muted" style={{ marginBottom: 12 }}>
              예상 {side === 'BUY' ? '매수' : '매도'} 금액:{' '}
              {Math.round(Number(qty) * (orderType === 'LIMIT' ? Number(limitPrice) || 0 : quote.price)).toLocaleString()}
              {isKR ? '원' : '달러'}
            </div>
          )}
          {error && <div className="error-text">{error}</div>}
          {message && <div style={{ color: 'var(--primary)', fontSize: 13, marginTop: 8 }}>{message}</div>}
          <button
            className={`btn ${side === 'BUY' ? 'btn-up' : 'btn-down'}`}
            style={{ width: '100%', marginTop: 8 }}
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? '처리 중...'
              : orderType === 'LIMIT'
              ? side === 'BUY'
                ? '지정가 매수 주문'
                : '지정가 매도 주문'
              : side === 'BUY'
              ? '매수하기'
              : '매도하기'}
          </button>
        </form>
      </div>

      {pendingOrders.length > 0 && (
        <>
          <div className="section-title">이 종목의 대기중인 주문</div>
          <div className="card" style={{ padding: '4px 12px' }}>
            {pendingOrders.map((o) => (
              <div className="tx-row" key={o.id}>
                <div>
                  <span className={`tx-badge ${o.side === 'BUY' ? 'buy' : 'sell'}`}>
                    {o.side === 'BUY' ? '매수' : '매도'}
                  </span>
                  {o.qty}주 @ {Math.round(o.limit_price).toLocaleString()}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={() => handleCancelOrder(o.id)}
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
