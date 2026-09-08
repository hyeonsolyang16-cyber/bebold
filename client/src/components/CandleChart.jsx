import { useMemo, useRef, useState } from 'react';

function formatDateLabel(dateStr, isIntraday) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  if (isIntraday) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function CandleChart({ candles, currency = 'KRW' }) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = 320;
  const height = 180;
  const padding = 8;

  const isIntraday = useMemo(() => {
    if (!candles || candles.length === 0) return false;
    return typeof candles[0].date === 'string' && candles[0].date.length > 10;
  }, [candles]);

  const { points, min, max, xStep, firstClose, lastClose } = useMemo(() => {
    if (!candles || candles.length === 0) {
      return { points: [], min: 0, max: 0, xStep: 0, firstClose: 0, lastClose: 0 };
    }
    const closes = candles.map((c) => c.close);
    const lo = Math.min(...candles.map((c) => c.low ?? c.close));
    const hi = Math.max(...candles.map((c) => c.high ?? c.close));
    const rng = hi - lo || 1;
    const step = (width - padding * 2) / Math.max(candles.length - 1, 1);
    const pts = candles.map((c, i) => {
      const x = padding + i * step;
      const y = padding + (1 - (c.close - lo) / rng) * (height - padding * 2);
      return { x, y };
    });
    return { points: pts, min: lo, max: hi, xStep: step, firstClose: closes[0], lastClose: closes[closes.length - 1] };
  }, [candles]);

  if (!candles || candles.length === 0) {
    return <div className="muted">차트 데이터가 없습니다.</div>;
  }

  const up = lastClose >= firstClose;
  const lineColor = up ? 'var(--up)' : 'var(--down)';

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPoints = `${padding},${height - padding} ${linePoints} ${width - padding},${height - padding}`;

  function updateHoverFromClientX(clientX) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * width;
    let idx = Math.round((relX - padding) / xStep);
    idx = Math.max(0, Math.min(candles.length - 1, idx));
    setHoverIndex(idx);
  }

  function handlePointerMove(e) {
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    if (clientX == null) return;
    updateHoverFromClientX(clientX);
  }

  function handlePointerLeave() {
    setHoverIndex(null);
  }

  const active = hoverIndex != null ? candles[hoverIndex] : null;
  const activePoint = hoverIndex != null ? points[hoverIndex] : null;

  function formatPrice(p) {
    if (p == null) return '-';
    return currency === 'KRW' ? `${Math.round(p).toLocaleString()}원` : `$${p.toFixed(2)}`;
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="candle-chart-hilo muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span>최고 {formatPrice(max)}</span>
        <span>최저 {formatPrice(min)}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onTouchMove={handlePointerMove}
        onTouchStart={handlePointerMove}
        onTouchEnd={handlePointerLeave}
        style={{ touchAction: 'none' }}
      >
        <polygon points={areaPoints} fill={lineColor} opacity="0.08" />
        <polyline points={linePoints} fill="none" stroke={lineColor} strokeWidth="2" />
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={padding}
              x2={activePoint.x}
              y2={height - padding}
              stroke="var(--text-secondary, #999)"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="3.5" fill={lineColor} stroke="white" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {active && (
        <div
          className="candle-chart-tooltip"
          style={{
            position: 'absolute',
            top: 24,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            background: 'var(--surface, rgba(0,0,0,0.04))',
            borderRadius: 8,
            padding: '6px 10px',
            pointerEvents: 'none',
          }}
        >
          <span className="muted">{formatDateLabel(active.date, isIntraday)}</span>
          <span style={{ fontWeight: 700 }}>{formatPrice(active.close)}</span>
        </div>
      )}
    </div>
  );
}
