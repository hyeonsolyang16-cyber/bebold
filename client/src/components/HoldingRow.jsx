import { useNavigate } from 'react-router-dom';

export default function HoldingRow({ holding }) {
  const navigate = useNavigate();
  const up = holding.unrealizedPnl >= 0;
  return (
    <div className="holding-row" onClick={() => navigate(`/stock/${encodeURIComponent(holding.symbol)}`)} role="button">
      <div className="top-row">
        <div>
          <div className="name">{holding.name || holding.symbol}</div>
          <div className="qty">{holding.qty}주 · 평단 {Math.round(holding.avgPrice).toLocaleString()}</div>
        </div>
        <div className="value">{Math.round(holding.marketValue).toLocaleString()}</div>
      </div>
      <div className="bottom-row">
        <span>평가손익</span>
        <span className={up ? 'up' : 'down'}>
          {up ? '+' : ''}
          {Math.round(holding.unrealizedPnl).toLocaleString()} ({up ? '+' : ''}
          {holding.returnPct.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
