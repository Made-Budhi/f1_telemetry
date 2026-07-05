"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/**
 * Minimal fetch hook with a module-level cache. Pass `null` to skip.
 * Cached URLs resolve synchronously in the effect, so revisiting a
 * session doesn't refetch anything.
 */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (cache.has(url)) {
      setData(cache.get(url) as T);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`request failed (${r.status})`);
        return r.json() as Promise<T>;
      })
      .then((json) => {
        cache.set(url, json);
        setData(json);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [url]);

  return { data, loading, error };
}
