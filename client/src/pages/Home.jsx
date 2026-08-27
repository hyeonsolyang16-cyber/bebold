import { useEffect, useState } from 'react';
import { api, getUser, setUser as saveUser } from '../api/client.js';
import { useAuth } from '../App.jsx';
import StockCard from '../components/StockCard.jsx';

const WATCHLIST = ['005930.KS', '000660.KS', '035420.KS', 'AAPL', 'TSLA'];

export default function Home() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [watchQuotes, setWatchQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [holdingsRes, txRes, quotes] = await Promise.all([
          api.get('/trades/holdings'),
          api.get('/trades/history'),
          Promise.all(WATCHLIST.map((s) => api.get(`/stocks/quote/${encodeURIComponent(s)}`))),
        ]);
        if (cancelled) return;
        setHoldings(holdingsRes.holdings);
        setTransactions(txRes.transactions.slice(0, 5));
        setWatchQuotes(quotes);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const holdingsValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const cash = user?.cash ?? 0;
  const initialCapital = user?.initialCapital ?? 10000000;
  const totalAssets = cash + holdingsValue;
  const returnPct = ((totalAssets / initialCapital) - 1) * 100;
  const todayPnl = holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0);

  return (
    <div>
      <div className="page-title">안녕하세요, {user?.nickname}님</div>

      <div className="summary-card">
        <div className="label">총 자산</div>
        <div className="total">{Math.round(totalAssets).toLocaleString()}원</div>
        <div className="stats">
          <div>
            수익률
            <span className={`value ${returnPct >= 0 ? '' : ''}`}>
              {returnPct >= 0 ? '+' : ''}
              {returnPct.toFixed(2)}%
            </span>
          </div>
          <div>
            평가손익
            <span className="value">
              {todayPnl >= 0 ? '+' : ''}
              {Math.round(todayPnl).toLocaleString()}원
            </span>
          </div>
          <div>
            보유현금
            <span className="value">{Math.round(cash).toLocaleString()}원</span>
          </div>
        </div>
      </div>

      <div className="section-title">관심 종목</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {watchQuotes.map((q) => (
          <StockCard
            key={q.symbol}
            symbol={q.symbol}
            name={q.name}
            price={q.price}
            changePercent={q.changePercent}
            currency={q.currency}
          />
        ))}
      </div>

      <div className="section-title">최근 거래 내역</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {loading && <div className="spinner-wrap">불러오는 중...</div>}
        {!loading && transactions.length === 0 && <div className="muted" style={{ padding: '14px 4px' }}>거래 내역이 없습니다.</div>}
        {transactions.map((tx) => (
          <div className="tx-row" key={tx.id}>
            <div>
              <span className={`tx-badge ${tx.side === 'BUY' ? 'buy' : 'sell'}`}>
                {tx.side === 'BUY' ? '매수' : '매도'}
              </span>
              {tx.name || tx.symbol}
            </div>
            <div>{tx.qty}주 · {Math.round(tx.price).toLocaleString()}원</div>
          </div>
        ))}
      </div>
    </div>
  );
}
