import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import StockCard from '../components/StockCard.jsx';

const POPULAR = [
  { symbol: '005930.KS', name: '삼성전자' },
  { symbol: '000660.KS', name: 'SK하이닉스' },
  { symbol: '035420.KS', name: 'NAVER' },
  { symbol: '035720.KS', name: '카카오' },
  { symbol: '005380.KS', name: '현대차' },
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
];

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPopularQuotes() {
      const list = await Promise.all(
        POPULAR.map((s) => api.get(`/stocks/quote/${encodeURIComponent(s.symbol)}`).catch(() => null))
      );
      if (cancelled) return;
      const map = {};
      list.forEach((q) => {
        if (q) map[q.symbol] = q;
      });
      setQuotes(map);
    }
    loadPopularQuotes();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const listToShow = results ?? POPULAR;

  return (
    <div>
      <div className="page-title">차트·검색</div>
      <input
        className="input"
        placeholder="종목명 또는 티커 검색 (예: 삼성전자, AAPL)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="section-title">{results ? '검색 결과' : '인기 종목'}</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {loading && <div className="spinner-wrap">검색 중...</div>}
        {!loading && listToShow.length === 0 && (
          <div className="muted" style={{ padding: '14px 4px' }}>검색 결과가 없습니다.</div>
        )}
        {!loading &&
          listToShow.map((item) => {
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
      </div>
    </div>
  );
}
