import { useEffect, useRef, useState } from 'react';

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Smoothly tweens a displayed number toward `target` whenever it changes,
// so a value that updates once per second still reads as continuously moving.
export default function useSmoothValue(target, durationMs = 900) {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(null);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    if (target === prevTargetRef.current) return undefined;
    fromRef.current = display;
    prevTargetRef.current = target;
    startRef.current = Date.now();
    cancelAnimationFrame(rafRef.current);

    function tick() {
      const elapsed = Date.now() - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeInOutQuad(progress);
      setDisplay(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
