import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, setUser as saveUser } from '../api/client.js';
import { useAuth } from '../App.jsx';
import CandleChart from '../components/CandleChart.jsx';

const RANGES = [
  { key: '1mo', label: '1개월' },
  { key: '3mo', label: '3개월' },
  { key: '6mo', label: '6개월' },
  { key: '1y', label: '1년' },
];

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [quote, setQuote] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState('3mo');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState('BUY');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myQty, setMyQty] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [q, holdingsRes] = await Promise.all([
          api.get(`/stocks/quote/${encodeURIComponent(symbol)}`),
          api.get('/trades/holdings'),
        ]);
        if (cancelled) return;
        setQuote(q);
        const holding = holdingsRes.holdings.find((h) => h.symbol === symbol);
        setMyQty(holding ? holding.qty : 0);
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const data = await api.get(`/stocks/history/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
        if (!cancelled) setHistory(data);
      } catch (err) {
        console.error(err);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

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
    setSubmitting(true);
    try {
      const path = side === 'BUY' ? '/trades/buy' : '/trades/sell';
      const body =
        side === 'BUY'
          ? { symbol, name: quote?.name, qty: quantity }
          : { symbol, qty: quantity };
      const res = await api.post(path, body);
      const updatedUser = { ...user, cash: res.cash };
      setUser(updatedUser);
      saveUser(updatedUser);
      setMessage(side === 'BUY' ? '매수가 완료되었습니다.' : '매도가 완료되었습니다.');
      setQty('');
      refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
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
        <div style={{ fontSize: 26, fontWeight: 800 }}>
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

        <div style={{ marginTop: 12 }}>
          <CandleChart candles={history?.candles} />
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
        <form onSubmit={handleSubmit}>
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
              예상 {side === 'BUY' ? '매수' : '매도'} 금액: {Math.round(Number(qty) * quote.price).toLocaleString()}
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
            {submitting ? '처리 중...' : side === 'BUY' ? '매수하기' : '매도하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
