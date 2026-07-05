"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/**
 * fetch + JSON with the API's own error message surfaced (e.g. the
 * OpenF1 live-lockout notice) instead of a bare status code.
 */
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) {
    let msg = `request failed (${r.status})`;
    try {
      const body = (await r.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // not JSON — keep the generic message
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

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
        if (!r.ok) {
          // surface the API's own error message when it sends one
          let msg = `request failed (${r.status})`;
          try {
            const body = (await r.json()) as { error?: string };
            if (body?.error) msg = body.error;
          } catch {
            // not JSON — keep the generic message
          }
          throw new Error(msg);
        }
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
