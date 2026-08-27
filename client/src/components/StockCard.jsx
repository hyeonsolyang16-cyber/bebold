import { useNavigate } from 'react-router-dom';

function formatPrice(price, currency) {
  if (price == null) return '-';
  if (currency === 'KRW') return `${Math.round(price).toLocaleString()}원`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StockCard({ symbol, name, price, changePercent, currency }) {
  const navigate = useNavigate();
  const up = (changePercent ?? 0) >= 0;
  return (
    <div className="stock-card" onClick={() => navigate(`/stock/${encodeURIComponent(symbol)}`)} role="button">
      <div className="info">
        <span className="symbol-name">{name || symbol}</span>
        <span className="symbol-code">{symbol}</span>
      </div>
      <div className="price-block">
        <div className="price">{formatPrice(price, currency)}</div>
        <div className={`change ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(changePercent ?? 0).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
