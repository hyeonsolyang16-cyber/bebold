import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../App.jsx';

export default function Ranking() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get('/ranking');
        if (!cancelled) setRanking(data.ranking);
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

  return (
    <div>
      <div className="page-title">수익률 랭킹</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {loading && <div className="spinner-wrap">불러오는 중...</div>}
        {!loading && ranking.length === 0 && <div className="muted" style={{ padding: '14px 4px' }}>랭킹 데이터가 없습니다.</div>}
        {ranking.map((r) => {
          const isMe = user && r.nickname === user.nickname;
          const up = r.returnPct >= 0;
          const topClass = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
          return (
            <div className={`rank-row ${topClass}`} key={`${r.rank}-${r.nickname}`} style={isMe ? { background: 'rgba(47,111,237,0.06)' } : undefined}>
              <div className="rank-number">{r.rank}</div>
              <div className="rank-info">
                <div className="rank-nickname">{r.nickname}{isMe ? ' (나)' : ''}</div>
                <div className="rank-assets">총자산 {Math.round(r.totalAssets).toLocaleString()}원</div>
              </div>
              <div className={`rank-return ${up ? 'up' : 'down'}`}>
                {up ? '+' : ''}
                {r.returnPct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
