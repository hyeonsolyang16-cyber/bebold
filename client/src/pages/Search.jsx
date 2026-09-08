import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import StockCard from '../components/StockCard.jsx';

const CATEGORIES = [
  { key: 'popular', label: '인기' },
  { key: 'volume', label: '거래대금' },
  { key: 'marketcap', label: '시가총액' },
  { key: 'gainers', label: '급등' },
  { key: 'losers', label: '급락' },
];

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('popular');
  const [categoryItems, setCategoryItems] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadCategory({ showSpinner } = { showSpinner: true }) {
      if (showSpinner) setCategoryLoading(true);
      try {
        const data = await api.get(`/stocks/categories/${category}`);
        if (cancelled) return;
        setCategoryItems(data.items || []);
      } catch (err) {
        console.error(err);
        if (!cancelled && showSpinner) setCategoryItems([]);
      } finally {
        if (!cancelled) setCategoryLoading(false);
      }
    }
    loadCategory({ showSpinner: true });
    const interval = setInterval(() => loadCategory({ showSpinner: false }), 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [category]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.get(`/stocks/search?q=${encodeURIComponent(query)}`);
        if (cancelled) return;
        setResults(data.results);
        const quoteList = await Promise.all(
          data.results.slice(0, 10).map((r) => api.get(`/stocks/quote/${encodeURIComponent(r.symbol)}`).catch(() => null))
        );
        if (cancelled) return;
        const map = {};
        quoteList.forEach((q) => {
          if (q) map[q.symbol] = q;
        });
        setQuotes((prev) => ({ ...prev, ...map }));
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showingSearch = !!results;

  return (
    <div>
      <div className="page-title">차트·검색</div>
      <input
        className="input"
        placeholder="종목명 또는 티커 검색 (예: 삼성전자, AAPL)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!showingSearch && (
        <div className="row" style={{ gap: 6, marginTop: 12, overflowX: 'auto' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`btn ${category === c.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="section-title">
        {showingSearch ? '검색 결과' : CATEGORIES.find((c) => c.key === category)?.label + ' 종목'}
      </div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {showingSearch ? (
          <>
            {loading && <div className="spinner-wrap">검색 중...</div>}
            {!loading && results.length === 0 && (
              <div className="muted" style={{ padding: '14px 4px' }}>검색 결과가 없습니다.</div>
            )}
            {!loading &&
              results.map((item) => {
                const q = quotes[item.symbol];
                return (
                  <StockCard
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    price={q?.price}
                    changePercent={q?.changePercent}
                    currency={q?.currency}
                  />
                );
              })}
          </>
        ) : (
          <>
            {categoryLoading && <div className="spinner-wrap">불러오는 중...</div>}
            {!categoryLoading && categoryItems.length === 0 && (
              <div className="muted" style={{ padding: '14px 4px' }}>표시할 종목이 없습니다.</div>
            )}
            {!categoryLoading &&
              categoryItems.map((q) => (
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
          </>
        )}
      </div>
    </div>
  );
}
