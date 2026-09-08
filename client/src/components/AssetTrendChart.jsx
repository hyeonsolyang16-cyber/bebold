export default function AssetTrendChart({ points, height = 64 }) {
  if (!points || points.length < 2) {
    return <div style={{ height }} />;
  }
  const width = 400;
  const padding = 4;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (width - padding * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = padding + i * xStep;
    const y = padding + (1 - (p.value - min) / range) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${height - padding} L${padding},${height - padding} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const up = last >= first;
  const color = up ? 'var(--up)' : 'var(--down)';
  const gradientId = `asset-trend-gradient-${up ? 'up' : 'down'}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3.5" fill={color} />
    </svg>
  );
}
