"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/useApi";
import { integrate } from "@/lib/telemetry";
import {
  buildTrackModel,
  drawBeacon,
  drawCar,
  drawTrack,
  makeProjector,
  type TrackModel,
} from "@/lib/track3d";
import { buildColorMap, fmtLap, teamColor } from "@/lib/format";
import type {
  CarSample,
  Driver,
  Lap,
  LocationSample,
  Session,
} from "@/lib/types";

/**
 * Ghost race: replays each driver's chosen lap from its own start line
 * moment, so the cars race the clock side by side on the 3D track. Every
 * ghost carries a light beacon. The live delta for each ghost is the
 * classic definition — elapsed time minus the time the reference lap
 * needed to reach the same distance — calibrated so it is exact at the
 * sector boundaries (see warp()).
 */

const enc = encodeURIComponent;
const SPEEDS = [0.5, 1, 2, 4];
const CANVAS_H = 420;
const DEFAULT_PITCH = 0.9;

interface GhostPt {
  t: number; // ms since lap start
  x: number;
  y: number;
  z: number;
}

interface Ghost {
  driver: Driver;
  lap: Lap;
  lapMs: number;
  loc: GhostPt[];
  time: number[]; // s since lap start (car_data)
  dist: number[]; // m, integrated from speed
  anchorD: number[]; // integrated distance at [start, S1, S2, finish]
}

const ghostCache = new Map<
  string,
  { loc: GhostPt[]; time: number[]; dist: number[] }
>();

async function loadGhost(
  session: Session,
  driver: Driver,
  lap: Lap,
): Promise<{ loc: GhostPt[]; time: number[]; dist: number[] }> {
  const key = `${session.session_key}:${driver.driver_number}:${lap.lap_number}`;
  const hit = ghostCache.get(key);
  if (hit) return hit;

  const start = lap.date_start!;
  const startMs = Date.parse(start);
  const end = new Date(
    startMs + ((lap.lap_duration ?? 120) + 0.5) * 1000,
  ).toISOString();
  const qs =
    `session_key=${session.session_key}&driver_number=${driver.driver_number}` +
    `&date>=${enc(start)}&date<${enc(end)}`;

  const [locRows, carRows] = await Promise.all([
    fetchJson<LocationSample[]>(`/api/openf1/location?${qs}`),
    fetchJson<CarSample[]>(`/api/openf1/car_data?${qs}`),
  ]);

  const loc = locRows
    .filter((r) => r.x !== 0 || r.y !== 0)
    .map((r) => ({
      t: Date.parse(r.date) - startMs,
      x: r.x,
      y: r.y,
      z: r.z ?? 0,
    }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  const ch = integrate(carRows, startMs);
  if (loc.length < 20 || !ch) {
    throw new Error(
      `no GPS/telemetry for ${driver.name_acronym} lap ${lap.lap_number}`,
    );
  }
  const out = { loc, time: ch.time, dist: ch.dist };
  ghostCache.set(key, out);
  return out;
}

function posAt(loc: GhostPt[], t: number): [number, number, number] {
  if (t <= loc[0].t) return [loc[0].x, loc[0].y, loc[0].z];
  const last = loc[loc.length - 1];
  if (t >= last.t) return [last.x, last.y, last.z];
  let lo = 0;
  let hi = loc.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (loc[m].t <= t) lo = m;
    else hi = m;
  }
  const a = loc[lo];
  const b = loc[hi];
  const f = (t - a.t) / Math.max(b.t - a.t, 1);
  return [
    a.x + (b.x - a.x) * f,
    a.y + (b.y - a.y) * f,
    a.z + (b.z - a.z) * f,
  ];
}

/** linear interpolation of ys over ascending xs */
function valAt(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const f = (x - xs[lo]) / Math.max(xs[hi] - xs[lo], 1e-9);
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}

/**
 * Cumulative lap times at [start, S1 end, S2 end, finish]. These are exact
 * (timing loops), unlike integrated telemetry — used to pin the delta.
 */
function cumSectorTimes(lap: Lap): number[] {
  const { duration_sector_1: s1, duration_sector_2: s2, lap_duration: L } = lap;
  if (s1 == null || s2 == null || L == null) return [0, lap.lap_duration ?? 0];
  return [0, s1, s1 + s2, L];
}

/**
 * Piecewise-linear remap of the ghost's distance axis onto the reference
 * car's, anchored at sector boundaries. Cancels per-car integration drift
 * and telemetry-feed latency, so the delta is exact at S/F, S1 and S2.
 */
function warp(x: number, from: number[], to: number[]): number {
  const n = from.length;
  if (x <= from[0]) return to[0] + (x - from[0]);
  if (x >= from[n - 1]) return to[n - 1] + (x - from[n - 1]);
  let i = 0;
  while (i < n - 2 && from[i + 1] < x) i++;
  const f = (x - from[i]) / Math.max(from[i + 1] - from[i], 1e-9);
  return to[i] + f * (to[i + 1] - to[i]);
}

function fmtElapsed(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rest}`;
}

export default function GhostTab({
  session,
  drivers,
  laps,
}: {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
}) {
  const [lapSel, setLapSel] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState<{ sig: string; ghosts: Ghost[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [clockMs, setClockMs] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const elapsedRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const deltaRefs = useRef(new Map<number, HTMLSpanElement>());

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const lapsByDriver = useMemo(() => {
    const m = new Map<number, Lap[]>();
    for (const l of laps) {
      if (l.lap_duration == null || l.date_start == null) continue;
      const arr = m.get(l.driver_number);
      if (arr) arr.push(l);
      else m.set(l.driver_number, [l]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.lap_number - b.lap_number);
    }
    return m;
  }, [laps]);

  const chosen = useMemo(() => {
    return drivers
      .map((d) => {
        const dl = lapsByDriver.get(d.driver_number) ?? [];
        if (!dl.length) return null;
        const fastest = dl.reduce((a, b) =>
          (b.lap_duration ?? Infinity) < (a.lap_duration ?? Infinity) ? b : a,
        );
        const lap =
          dl.find((l) => l.lap_number === lapSel[d.driver_number]) ?? fastest;
        return { driver: d, lap };
      })
      .filter((x): x is { driver: Driver; lap: Lap } => x != null);
  }, [drivers, lapsByDriver, lapSel]);

  const sig =
    `${session.session_key}|` +
    chosen.map((c) => `${c.driver.driver_number}:${c.lap.lap_number}`).join(",");

  useEffect(() => {
    if (!chosen.length) {
      setLoaded(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all(
      chosen.map(async ({ driver, lap }) => {
        const data = await loadGhost(session, driver, lap);
        const anchorD = cumSectorTimes(lap).map((t) =>
          valAt(data.time, data.dist, t),
        );
        return {
          driver,
          lap,
          lapMs: (lap.lap_duration ?? 0) * 1000,
          ...data,
          anchorD,
        } as Ghost;
      }),
    )
      .then((ghosts) => {
        if (!alive) return;
        setLoaded({ sig, ghosts });
        setLoading(false);
        elapsedRef.current = 0;
        setClockMs(0);
        setPlaying(true); // lights out immediately
      })
      .catch((e: Error) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // chosen/session are fully captured by sig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const track = useMemo<TrackModel | null>(
    () => (loaded?.ghosts.length ? buildTrackModel(loaded.ghosts[0].loc) : null),
    [loaded],
  );

  const colors = useMemo(
    () => buildColorMap(loaded?.ghosts.map((g) => g.driver) ?? []),
    [loaded],
  );

  const maxMs = useMemo(
    () => Math.max(0, ...(loaded?.ghosts.map((g) => g.lapMs) ?? [])),
    [loaded],
  );

  // wheel zoom must be a non-passive listener to preventDefault
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = camRef.current;
      c.zoom = Math.min(3.5, Math.max(0.5, c.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [track]);

  // ---- animation + draw loop ----
  useEffect(() => {
    if (!loaded || !track) return;
    let raf = 0;
    let lastWall: number | null = null;
    let lastUi = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // clamp so returning from a hidden tab doesn't teleport the playhead
      const wallDt = lastWall == null ? 0 : Math.min(now - lastWall, 100);
      lastWall = now;

      if (playingRef.current) {
        elapsedRef.current = Math.min(
          elapsedRef.current + wallDt * speedRef.current,
          maxMs,
        );
        if (elapsedRef.current >= maxMs) {
          playingRef.current = false;
          setPlaying(false);
        }
      }
      const e = elapsedRef.current;
      const ref = loaded.ghosts[0];

      const cv = canvasRef.current;
      if (cv) {
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth || 800;
        if (cv.width !== Math.round(w * dpr) || cv.height !== CANVAS_H * dpr) {
          cv.width = Math.round(w * dpr);
          cv.height = CANVAS_H * dpr;
        }
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, CANVAS_H);
          const proj = makeProjector(camRef.current, w, CANVAS_H, track.R);
          drawTrack(ctx, proj, track);

          const cars = loaded.ghosts.map((g) => {
            const [x, y, z] = posAt(g.loc, Math.min(e, g.lapMs));
            const world = track.toWorld(x, y, z);
            return { g, world, depth: proj.depth(world) };
          });
          cars.sort((a, b) => b.depth - a.depth); // far first
          for (const c of cars) {
            const color = colors.get(c.g.driver.driver_number)?.stroke ?? "#999";
            drawBeacon(ctx, proj, c.world, color, now);
            drawCar(ctx, proj, c.world, color, {
              label: c.g.driver.name_acronym,
            });
          }
        }
      }

      for (const g of loaded.ghosts) {
        if (g === ref) continue;
        const span = deltaRefs.current.get(g.driver.driver_number);
        if (span) {
          const eS = Math.min(e, g.lapMs) / 1000;
          const dRaw = valAt(g.time, g.dist, eS);
          const dRef =
            g.anchorD.length === ref.anchorD.length
              ? warp(dRaw, g.anchorD, ref.anchorD)
              : dRaw;
          const tRef = valAt(ref.dist, ref.time, dRef);
          const delta = eS - tRef;
          span.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
          span.style.color =
            delta > 0.005 ? "#f87171" : delta < -0.005 ? "#4ade80" : "#e7e7ec";
        }
      }

      if (now - lastUi > 150) {
        lastUi = now;
        setClockMs(Math.round(e));
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded, track, maxMs, colors]);

  if (!chosen.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No timed laps for the selected drivers.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {chosen.map(({ driver, lap }) => {
          const dl = lapsByDriver.get(driver.driver_number) ?? [];
          return (
            <label
              key={driver.driver_number}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="font-mono font-semibold"
                style={{ color: teamColor(driver.team_colour) }}
              >
                {driver.name_acronym}
              </span>
              <select
                value={lap.lap_number}
                onChange={(ev) =>
                  setLapSel((s) => ({
                    ...s,
                    [driver.driver_number]: Number(ev.target.value),
                  }))
                }
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
              >
                {dl.map((l) => (
                  <option key={l.lap_number} value={l.lap_number}>
                    L{l.lap_number} — {fmtLap(l.lap_duration)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {chosen.length === 1 && (
          <span className="text-xs text-muted">
            Select a second driver above to race a ghost against.
          </span>
        )}
      </div>

      {loading && (
        <p className="animate-pulse text-sm text-muted">Loading ghost laps…</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {loaded && track && !loading && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="relative">
            <canvas
              ref={canvasRef}
              style={{ height: CANVAS_H, touchAction: "none" }}
              className="w-full cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current;
                if (!drag) return;
                const dx = e.clientX - drag.x;
                const dy = e.clientY - drag.y;
                drag.x = e.clientX;
                drag.y = e.clientY;
                const c = camRef.current;
                c.yaw += dx * 0.006;
                c.pitch = Math.min(1.25, Math.max(0, c.pitch + dy * 0.005));
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
            />
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/70 px-2 py-1 text-[10px] text-muted">
              drag to rotate · scroll to zoom
            </div>

            {/* live delta board */}
            <div className="absolute right-2 top-2 space-y-1 rounded-lg bg-background/85 p-3 backdrop-blur-sm">
              {loaded.ghosts.map((g, i) => (
                <div
                  key={g.driver.driver_number}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-3 w-1 rounded-sm"
                      style={{
                        background: colors.get(g.driver.driver_number)?.stroke,
                      }}
                    />
                    <span className="font-mono text-xs font-semibold">
                      {g.driver.name_acronym}
                    </span>
                  </span>
                  {i === 0 ? (
                    <span className="font-mono text-xs text-muted">REF</span>
                  ) : (
                    <span
                      className="font-mono text-sm font-bold tabular-nums"
                      ref={(el) => {
                        if (el) deltaRefs.current.set(g.driver.driver_number, el);
                        else deltaRefs.current.delete(g.driver.driver_number);
                      }}
                    >
                      0.00
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button
              onClick={() => {
                if (!playing && elapsedRef.current >= maxMs) {
                  elapsedRef.current = 0;
                  setClockMs(0);
                }
                setPlaying(!playing);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white transition-opacity hover:opacity-90"
              title={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    speed === s
                      ? "bg-surface-2 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, maxMs)}
              step={50}
              value={clockMs}
              onChange={(ev) => {
                const v = Number(ev.target.value);
                elapsedRef.current = v;
                setClockMs(v);
              }}
              className="min-w-40 flex-1 accent-(--accent)"
            />
            <span className="font-mono text-xs text-muted">
              {fmtElapsed(clockMs)} / {fmtElapsed(maxMs)}
            </span>
            <button
              onClick={() => {
                camRef.current = { yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 };
              }}
              className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-foreground"
            >
              Reset view
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2 text-xs text-muted">
            {loaded.ghosts.map((g, i) => (
              <span key={g.driver.driver_number} className="font-mono">
                {g.driver.name_acronym} L{g.lap.lap_number}{" "}
                {fmtLap(g.lap.lap_duration)}
                {i > 0 &&
                  loaded.ghosts[0].lap.lap_duration != null &&
                  g.lap.lap_duration != null && (
                    <span className="ml-1 text-muted">
                      (
                      {g.lap.lap_duration >= loaded.ghosts[0].lap.lap_duration
                        ? "+"
                        : ""}
                      {(
                        g.lap.lap_duration - loaded.ghosts[0].lap.lap_duration
                      ).toFixed(3)}
                      )
                    </span>
                  )}
              </span>
            ))}
            <span className="ml-auto">
              Δ = time vs {loaded.ghosts[0].driver.name_acronym} at equal
              distance · ±0.2s mid-lap (3.7 Hz feed) · green = ahead
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
