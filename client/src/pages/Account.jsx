import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, logout } from '../api/client.js';
import { useAuth } from '../App.jsx';
import HoldingRow from '../components/HoldingRow.jsx';

export default function Account() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [holdingsRes, txRes] = await Promise.all([
          api.get('/trades/holdings'),
          api.get('/trades/history'),
        ]);
        if (cancelled) return;
        setHoldings(holdingsRes.holdings);
        setTransactions(txRes.transactions);
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

  function handleLogout() {
    logout();
    setUser(null);
    navigate('/login');
  }

  return (
    <div>
      <div className="page-title">내 계좌</div>

      <div className="summary-card">
        <div className="label">{user?.nickname}님의 총 자산</div>
        <div className="total">{Math.round(totalAssets).toLocaleString()}원</div>
        <div className="stats">
          <div>
            수익률
            <span className="value">
              {returnPct >= 0 ? '+' : ''}
              {returnPct.toFixed(2)}%
            </span>
          </div>
          <div>
            현금
            <span className="value">{Math.round(cash).toLocaleString()}원</span>
          </div>
          <div>
            주식평가금
            <span className="value">{Math.round(holdingsValue).toLocaleString()}원</span>
          </div>
        </div>
      </div>

      <div className="section-title">보유 종목</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {loading && <div className="spinner-wrap">불러오는 중...</div>}
        {!loading && holdings.length === 0 && (
          <div className="muted" style={{ padding: '14px 4px' }}>보유 중인 종목이 없습니다.</div>
        )}
        {holdings.map((h) => (
          <HoldingRow key={h.symbol} holding={h} />
        ))}
      </div>

      <div className="section-title">전체 거래 내역</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {!loading && transactions.length === 0 && (
          <div className="muted" style={{ padding: '14px 4px' }}>거래 내역이 없습니다.</div>
        )}
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

      <button className="btn btn-outline" style={{ width: '100%', marginTop: 20 }} onClick={handleLogout}>
        로그아웃
      </button>
    </div>
  );
}
