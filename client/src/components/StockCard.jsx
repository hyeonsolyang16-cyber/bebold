import { useNavigate } from 'react-router-dom';

function formatPrice(price, currency) {
  if (price == null) return '-';
  if (currency === 'KRW') return `${Math.round(price).toLocaleString()}원`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StockCard({ symbol, name, price, changePercent, currency, mock, starred, onToggleStar }) {
  const navigate = useNavigate();
  const up = (changePercent ?? 0) >= 0;
  return (
    <div className="stock-card" onClick={() => navigate(`/stock/${encodeURIComponent(symbol)}`)} role="button">
      {onToggleStar && (
        <button
          type="button"
          className="star-btn"
          aria-label={starred ? '관심 종목에서 제거' : '관심 종목에 추가'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(symbol, name);
          }}
        >
          {starred ? '★' : '☆'}
        </button>
      )}
      <div className="stock-avatar" aria-hidden="true">{(name || symbol).slice(0, 1)}</div>
      <div className="info">
        <span className="symbol-name">{name || symbol}</span>
        <span className="symbol-code">
          {symbol}
          {mock && <span className="mock-badge">데모 가격</span>}
        </span>
      </div>
      <div className="price-block">
        <div className="price">{formatPrice(price, currency)}</div>
        <div className={`change-pill ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(changePercent ?? 0).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
