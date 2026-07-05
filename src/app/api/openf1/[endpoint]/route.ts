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

// Short server-side cache for everything: long enough to absorb bursts and
// repeat visits, short enough that a "no data yet" answer during a live
// session can't get pinned for a day. Clients keep their own in-memory cache.
const REVALIDATE = 300;

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
    // OpenF1 uses 404 for "no data (yet)" — e.g. a session inside the live
    // window on the free tier. Normalize to an empty result so the UI can
    // show a friendly empty state instead of an error.
    if (res && res.status === 404) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=30" },
      });
    }
    if (!res || !res.ok) {
      const status = res?.status === 429 ? 429 : 502;
      return NextResponse.json(
        { error: `OpenF1 responded ${res?.status ?? "with a network error"}` },
        { status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "failed to reach OpenF1" },
      { status: 502 },
    );
  }
}
