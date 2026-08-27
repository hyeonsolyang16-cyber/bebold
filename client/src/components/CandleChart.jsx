export default function CandleChart({ candles }) {
  if (!candles || candles.length === 0) {
    return <div className="muted">차트 데이터가 없습니다.</div>;
  }
  const width = 320;
  const height = 160;
  const padding = 8;

  const closes = candles.map((c) => c.close);
  const min = Math.min(...candles.map((c) => c.low ?? c.close));
  const max = Math.max(...candles.map((c) => c.high ?? c.close));
  const range = max - min || 1;

  const xStep = (width - padding * 2) / Math.max(candles.length - 1, 1);

  const points = candles.map((c, i) => {
    const x = padding + i * xStep;
    const y = padding + (1 - (c.close - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const up = lastClose >= firstClose;
  const lineColor = up ? 'var(--up)' : 'var(--down)';

  const areaPoints = `${padding},${height - padding} ${points.join(' ')} ${
    width - padding
  },${height - padding}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polygon points={areaPoints} fill={lineColor} opacity="0.08" />
      <polyline points={points.join(' ')} fill="none" stroke={lineColor} strokeWidth="2" />
    </svg>
  );
}
