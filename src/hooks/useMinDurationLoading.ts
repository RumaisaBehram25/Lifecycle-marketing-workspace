import { useCallback, useRef, useState } from 'react';

/**
 * Loading flag that stays visible at least `minMs` so very fast requests (e.g. ~100ms) still show UI feedback.
 */
export function useMinDurationLoading(minMs = 280) {
  const startRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);

  const startLoading = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startRef.current = Date.now();
    setLoading(true);
  }, []);

  const stopLoading = useCallback(
    (immediate = false) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (immediate) {
        startRef.current = null;
        setLoading(false);
        return;
      }
      const started = startRef.current;
      startRef.current = null;
      if (started == null) {
        setLoading(false);
        return;
      }
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, minMs - elapsed);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setLoading(false);
      }, remaining);
    },
    [minMs],
  );

  return { loading, startLoading, stopLoading };
}
