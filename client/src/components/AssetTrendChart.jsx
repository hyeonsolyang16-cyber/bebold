import { useEffect, useRef, useState } from 'react';

const SAMPLE_MS = 100; // redraw the interpolated line every 100ms (~10fps sampling, smooth to the eye)
const SMOOTH_BUFFER = 80; // ~8s of trailing smoothed samples

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Turns sparse "real" points (e.g. one per second from the server) into a smooth,
// continuously-flowing line by interpolating between the last two real points on
// every animation tick, instead of jumping the chart every time new data arrives.
export default function AssetTrendChart({ points, height = 64, smooth = true }) {
  const [smoothPoints, setSmoothPoints] = useState([]);
  const rafRef = useRef(null);
  const bufferRef = useRef([]);

  useEffect(() => {
    if (!smooth || !points || points.length < 2) return undefined;

    function tick() {
      const now = Date.now();
      const prev = points[points.length - 2];
      const curr = points[points.length - 1];
      const span = curr.t - prev.t || 1;
      const rawProgress = Math.min(1, Math.max(0, (now - curr.t) / Math.min(span, 4000)));
      // Once we've caught up to the latest real point, hold there instead of overshooting.
      const progress = curr.t <= now ? Math.min(1, rawProgress + 1) : rawProgress;
      const eased = easeInOutQuad(Math.min(progress, 1));
      const value = curr.t <= now ? curr.value : prev.value + (curr.value - prev.value) * eased;

      const buf = bufferRef.current;
      const last = buf[buf.length - 1];
      if (!last || now - last.t >= SAMPLE_MS) {
        buf.push({ t: now, value });
        if (buf.length > SMOOTH_BUFFER) buf.shift();
        setSmoothPoints([...buf]);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [points]);

  const display = smooth && smoothPoints.length >= 2 ? smoothPoints : points;
  if (!display || display.length < 2) {
    return <div style={{ height }} />;
  }

  const width = 400;
  const padding = 4;
  const values = display.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const xStep = (width - padding * 2) / (display.length - 1);
  const coords = display.map((p, i) => {
    const x = padding + i * xStep;
    const y = padding + (1 - (p.value - min) / range) * (height - padding * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${height - padding} L${padding},${height - padding} Z`;

  const first = points[0].value;
  const last = points[points.length - 1].value;
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
