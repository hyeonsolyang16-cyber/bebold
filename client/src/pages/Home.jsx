import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../App.jsx';
import StockCard from '../components/StockCard.jsx';
import AssetTrendChart from '../components/AssetTrendChart.jsx';
import useSmoothValue from '../hooks/useSmoothValue.js';

const WATCHLIST = ['005930.KS', '000660.KS', '035420.KS', 'AAPL', 'TSLA'];
const POLL_MS = 1000;
const MAX_POINTS = 40;

export default function Home() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [watchQuotes, setWatchQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assetHistory, setAssetHistory] = useState([]);
  const cashRef = useRef(user?.cash ?? 0);

  useEffect(() => {
    let cancelled = false;

    async function loadOnce({ withExtras } = { withExtras: false }) {
      try {
        const tasks = [api.get('/trades/holdings')];
        if (withExtras) {
          tasks.push(api.get('/trades/history'));
          tasks.push(Promise.all(WATCHLIST.map((s) => api.get(`/stocks/quote/${encodeURIComponent(s)}`))));
        }
        const [holdingsRes, txRes, quotes] = await Promise.all(tasks);
        if (cancelled) return;

        setHoldings(holdingsRes.holdings);
        if (txRes) setTransactions(txRes.transactions.slice(0, 5));
        if (quotes) setWatchQuotes(quotes);

        const holdingsValue = holdingsRes.holdings.reduce((sum, h) => sum + h.marketValue, 0);
        const totalNow = cashRef.current + holdingsValue;
        setAssetHistory((prev) => {
          const next = [...prev, { t: Date.now(), value: totalNow }];
          return next.slice(-MAX_POINTS);
        });
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOnce({ withExtras: true });
    const interval = setInterval(() => loadOnce({ withExtras: false }), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const holdingsValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
  const cash = user?.cash ?? 0;
  cashRef.current = cash;
  const initialCapital = user?.initialCapital ?? 10000000;
  const totalAssets = cash + holdingsValue;
  const returnPct = ((totalAssets / initialCapital) - 1) * 100;
  const returnUp = returnPct >= 0;
  const todayPnl = holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0);
  const smoothTotalAssets = useSmoothValue(totalAssets);

  return (
    <div>
      <div className="page-title">안녕하세요, {user?.nickname}님</div>

      <div className="asset-card">
        <div className="asset-card-top">
          <div className="asset-label">총 자산</div>
          <span className="live-dot" aria-hidden="true" />
          <span className="live-label">실시간</span>
        </div>
        <div className="asset-total">{Math.round(smoothTotalAssets).toLocaleString()}원</div>
        <div className={`asset-change-pill ${returnUp ? 'up' : 'down'}`}>
          {returnUp ? '▲' : '▼'} {Math.abs(returnPct).toFixed(2)}%
          <span className="asset-change-amount">
            {todayPnl >= 0 ? '+' : ''}
            {Math.round(todayPnl).toLocaleString()}원
          </span>
        </div>

        <div className="asset-chart">
          <AssetTrendChart points={assetHistory} />
        </div>

        <div className="asset-card-footer">
          <div className="asset-footer-item">
            <span className="asset-footer-label">보유현금</span>
            <span className="asset-footer-value">{Math.round(cash).toLocaleString()}원</span>
          </div>
          <div className="asset-footer-item">
            <span className="asset-footer-label">주식평가금</span>
            <span className="asset-footer-value">{Math.round(holdingsValue).toLocaleString()}원</span>
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
            mock={q.mock}
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
