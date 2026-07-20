"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * have passed without `value` changing. Use for search-as-you-type inputs
 * so you fetch on the settled value, not on every keystroke.
 *
 *   const [q, setQ] = useState("");
 *   const debouncedQ = useDebouncedValue(q, 300);
 *   useEffect(() => { fetchResults(debouncedQ); }, [debouncedQ]);
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Returns a debounced version of `callback` — repeated calls within `delay`
 * ms collapse into a single trailing call. The returned function is stable
 * across renders; the latest `callback` is always used.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 300,
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);

  // Keep the ref pointing at the latest callback without recreating the
  // debounced function (so it stays stable).
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clear any pending call on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );
}

/**
 * Returns a throttled version of `callback` — it fires at most once every
 * `interval` ms, on the leading edge, and schedules a trailing call for the
 * last invocation. Use for high-frequency events (scroll, resize, pointer
 * move) where you want responsiveness but not a call per frame.
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  interval = 100,
): (...args: Args) => void {
  const callbackRef = useRef(callback);
  const lastRunRef = useRef(0);
  const trailingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (trailingTimerRef.current !== null) {
        window.clearTimeout(trailingTimerRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      const remaining = interval - (now - lastRunRef.current);
      if (remaining <= 0) {
        lastRunRef.current = now;
        callbackRef.current(...args);
      } else if (trailingTimerRef.current === null) {
        // Schedule a trailing call so the final event isn't dropped.
        trailingTimerRef.current = window.setTimeout(() => {
          lastRunRef.current = Date.now();
          trailingTimerRef.current = null;
          callbackRef.current(...args);
        }, remaining);
      }
    },
    [interval],
  );
}
