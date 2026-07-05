import { NextRequest, NextResponse } from "next/server";

const ALLOWED = new Set([
  "meetings",
  "sessions",
  "drivers",
  "laps",
  "stints",
  "position",
  "intervals",
  "car_data",
  "location",
  "pit",
  "weather",
  "race_control",
]);

// Short server-side cache: long enough to absorb bursts and repeat visits,
// short enough that a "no data yet" answer during a live session can't get
// pinned for a day. Clients keep their own in-memory cache.
const REVALIDATE = 300;

// OpenF1 locks the ENTIRE free API (historical data included) while any F1
// session is live. Keep the last successful bodies so the app can serve
// stale data through those windows instead of erroring.
const staleCache = new Map<string, unknown>();
const MAX_STALE_ENTRIES = 80;

function remember(url: string, body: unknown) {
  if (staleCache.has(url)) staleCache.delete(url);
  staleCache.set(url, body);
  if (staleCache.size > MAX_STALE_ENTRIES) {
    staleCache.delete(staleCache.keys().next().value!);
  }
}

const LIVE_LOCKOUT_MSG =
  "OpenF1 pauses free API access while a live F1 session is running. " +
  "Data (including historical sessions) returns shortly after the session ends.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await ctx.params;
  if (!ALLOWED.has(endpoint)) {
    return NextResponse.json({ error: "unknown endpoint" }, { status: 400 });
  }

  const url = `https://api.openf1.org/v1/${endpoint}${req.nextUrl.search}`;
  try {
    let res: Response | null = null;
    // free tier allows 3 req/s; parallel page loads can trip it, so retry
    // 429s/5xx with jittered backoff so concurrent retries don't re-collide
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, {
        next: { revalidate: REVALIDATE },
      });
      if (res.status !== 429 && res.status < 500) break;
      await sleep(600 * (attempt + 1) + Math.random() * 400);
    }

    // OpenF1 uses 404 for "no data (yet)" — e.g. a session that hasn't been
    // published. Normalize to an empty result for a friendly empty state.
    if (res && res.status === 404) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=30" },
      });
    }

    if (res?.ok) {
      const data = await res.json();
      remember(url, data);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }

    // upstream failed — serve the last good copy if we have one
    if (staleCache.has(url)) {
      return NextResponse.json(staleCache.get(url), {
        headers: { "Cache-Control": "no-store", "X-Stale": "1" },
      });
    }
    if (res?.status === 401) {
      return NextResponse.json({ error: LIVE_LOCKOUT_MSG }, { status: 503 });
    }
    return NextResponse.json(
      { error: `OpenF1 responded ${res?.status ?? "with a network error"}` },
      { status: res?.status === 429 ? 429 : 502 },
    );
  } catch {
    if (staleCache.has(url)) {
      return NextResponse.json(staleCache.get(url), {
        headers: { "Cache-Control": "no-store", "X-Stale": "1" },
      });
    }
    return NextResponse.json(
      { error: "failed to reach OpenF1" },
      { status: 502 },
    );
  }
}
