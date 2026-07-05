"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { teamColor } from "@/lib/format";
import { fetchJson } from "@/lib/useApi";
import {
  buildTrackModel,
  drawBeacon,
  drawCar,
  drawTrack,
  makeProjector,
  type TrackModel,
} from "@/lib/track3d";
import type {
  CarSample,
  Driver,
  Lap,
  LocationSample,
  PositionEntry,
  Session,
} from "@/lib/types";

/**
 * Session replay: streams GPS positions in 2-minute chunks (a full race is
 * ~40MB, so we buffer around the playhead instead), renders the circuit in
 * 3D (real elevation from the z channel) on a canvas via rAF, and samples
 * car_data for the focused driver's live gauge. React state only updates at
 * ~4Hz for the clock/leaderboard; the 60fps path never re-renders.
 */

const CHUNK_MS = 120_000;
const SPEEDS = [1, 2, 5, 10, 25];
const CANVAS_H = 440;
const DEFAULT_PITCH = 0.9;

interface Pt {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface CarPt {
  t: number;
  speed: number;
  gear: number;
  rpm: number;
  thr: number;
  brk: number;
  drs: boolean;
}

const DRS_ON = new Set([10, 12, 14]);
const enc = encodeURIComponent;

function samplePos(
  arr: Pt[] | undefined,
  prev: Pt[] | undefined,
  t: number,
): { x: number; y: number; z: number; stale: boolean } | null {
  let a = arr;
  if ((!a || !a.length || t < a[0].t) && prev?.length) a = prev;
  if (!a || !a.length) return null;
  if (t <= a[0].t) {
    return { x: a[0].x, y: a[0].y, z: a[0].z, stale: a[0].t - t > 5000 };
  }
  const last = a[a.length - 1];
  if (t >= last.t) {
    return { x: last.x, y: last.y, z: last.z, stale: t - last.t > 30_000 };
  }
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const p0 = a[lo];
  const p1 = a[hi];
  // don't interpolate across data gaps (red flags, retirement, GPS dropout)
  if (p1.t - p0.t > 5000) return { x: p0.x, y: p0.y, z: p0.z, stale: true };
  const f = (t - p0.t) / Math.max(p1.t - p0.t, 1);
  return {
    x: p0.x + (p1.x - p0.x) * f,
    y: p0.y + (p1.y - p0.y) * f,
    z: p0.z + (p1.z - p0.z) * f,
    stale: false,
  };
}

function sampleCar(
  arr: CarPt[] | undefined,
  prev: CarPt[] | undefined,
  t: number,
): CarPt | null {
  let a = arr;
  if ((!a || !a.length || t < a[0].t) && prev?.length) a = prev;
  if (!a || !a.length) return null;
  if (t <= a[0].t) return a[0];
  if (t >= a[a.length - 1].t) return a[a.length - 1];
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return a[lo];
}

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function ReplayTab({
  session,
  drivers,
  laps,
  positions,
}: {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
  positions: PositionEntry[];
}) {
  const t0 = useMemo(() => Date.parse(session.date_start), [session]);
  const t1 = useMemo(() => Date.parse(session.date_end), [session]);
  const durationS = Math.max(1, Math.floor((t1 - t0) / 1000));

  const [track, setTrack] = useState<TrackModel | null>(null);
  const [trackErr, setTrackErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [clock, setClock] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [focus, setFocus] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hitRef = useRef(new Map<number, [number, number]>());
  const trackRef = useRef<TrackModel | null>(null);
  const timeRef = useRef(t0);
  const playingRef = useRef(false);
  const speedRef = useRef(5);
  const focusRef = useRef<number | null>(null);
  const labelsRef = useRef(true);
  const locChunks = useRef(new Map<number, Map<number, Pt[]>>());
  const carChunks = useRef(new Map<string, CarPt[]>());
  const inflight = useRef(new Set<string>());
  const gaugeRefs = useRef<{
    speed?: HTMLSpanElement | null;
    rpm?: HTMLSpanElement | null;
    gear?: HTMLSpanElement | null;
    drs?: HTMLSpanElement | null;
    thr?: HTMLDivElement | null;
    brk?: HTMLDivElement | null;
  }>({});

  useEffect(() => {
    trackRef.current = track;
  }, [track]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  useEffect(() => {
    labelsRef.current = showLabels;
  }, [showLabels]);

  // ---- track model from the session's fastest lap ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const candidates = laps
          .filter((l) => l.lap_duration != null && l.date_start != null)
          .sort((a, b) => a.lap_duration! - b.lap_duration!);
        if (!candidates.length) {
          throw new Error("no timed laps available to trace the track outline");
        }
        const ref = candidates[0];
        const start = ref.date_start!;
        const end = new Date(
          Date.parse(start) + (ref.lap_duration! + 0.3) * 1000,
        ).toISOString();
        const rows = await fetchJson<LocationSample[]>(
          `/api/openf1/location?session_key=${session.session_key}` +
            `&driver_number=${ref.driver_number}` +
            `&date>=${enc(start)}&date<${enc(end)}`,
        );
        const model = buildTrackModel(rows);
        if (!model) throw new Error("no GPS data published for this session");
        if (alive) {
          setTrack(model);
          setTrackErr(null);
        }
      } catch (e) {
        if (alive) setTrackErr((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [session.session_key, laps]);

  // ---- chunk loaders ----
  const loadLocChunk = useCallback(
    async (idx: number) => {
      if (idx < 0 || t0 + idx * CHUNK_MS >= t1) return;
      const key = `loc:${idx}`;
      if (locChunks.current.has(idx) || inflight.current.has(key)) return;
      inflight.current.add(key);
      try {
        const s = new Date(t0 + idx * CHUNK_MS).toISOString();
        const e = new Date(Math.min(t0 + (idx + 1) * CHUNK_MS, t1)).toISOString();
        const res = await fetch(
          `/api/openf1/location?session_key=${session.session_key}` +
            `&date>=${enc(s)}&date<${enc(e)}`,
        );
        if (!res.ok) return;
        const rows = (await res.json()) as LocationSample[];
        const m = new Map<number, Pt[]>();
        for (const r of rows) {
          if (r.x === 0 && r.y === 0) continue;
          const p = { t: Date.parse(r.date), x: r.x, y: r.y, z: r.z ?? 0 };
          const arr = m.get(r.driver_number);
          if (arr) arr.push(p);
          else m.set(r.driver_number, [p]);
        }
        for (const arr of m.values()) arr.sort((a, b) => a.t - b.t);
        locChunks.current.set(idx, m);
      } finally {
        inflight.current.delete(key);
      }
    },
    [session.session_key, t0, t1],
  );

  const loadCarChunk = useCallback(
    async (idx: number, dn: number) => {
      if (idx < 0 || t0 + idx * CHUNK_MS >= t1) return;
      const key = `${dn}:${idx}`;
      if (carChunks.current.has(key) || inflight.current.has(`car:${key}`)) return;
      inflight.current.add(`car:${key}`);
      try {
        const s = new Date(t0 + idx * CHUNK_MS).toISOString();
        const e = new Date(Math.min(t0 + (idx + 1) * CHUNK_MS, t1)).toISOString();
        const res = await fetch(
          `/api/openf1/car_data?session_key=${session.session_key}` +
            `&driver_number=${dn}&date>=${enc(s)}&date<${enc(e)}`,
        );
        if (!res.ok) return;
        const rows = (await res.json()) as CarSample[];
        const arr: CarPt[] = rows
          .map((r) => ({
            t: Date.parse(r.date),
            speed: r.speed,
            gear: r.n_gear,
            rpm: r.rpm,
            thr: r.throttle,
            brk: r.brake,
            drs: DRS_ON.has(r.drs),
          }))
          .sort((a, b) => a.t - b.t);
        carChunks.current.set(key, arr);
      } finally {
        inflight.current.delete(`car:${key}`);
      }
    },
    [session.session_key, t0, t1],
  );

  // kick off the first chunk immediately
  useEffect(() => {
    void loadLocChunk(0);
  }, [loadLocChunk]);

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

  const byNum = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // ---- 60fps playback + draw loop (no React re-renders in here) ----
  useEffect(() => {
    let raf = 0;
    let lastWall: number | null = null;
    let lastUi = 0;
    let wasBuffering = true;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // clamp so returning from a hidden tab doesn't teleport the playhead
      const wallDt = lastWall == null ? 0 : Math.min(now - lastWall, 100);
      lastWall = now;

      if (playingRef.current) {
        timeRef.current = Math.min(
          timeRef.current + wallDt * speedRef.current,
          t1,
        );
        if (timeRef.current >= t1) {
          playingRef.current = false;
          setPlaying(false);
        }
      }

      const t = timeRef.current;
      const idx = Math.floor((t - t0) / CHUNK_MS);
      void loadLocChunk(idx);
      if (t - (t0 + idx * CHUNK_MS) > CHUNK_MS * 0.5) void loadLocChunk(idx + 1);

      const chunk = locChunks.current.get(idx);
      const prevChunk = locChunks.current.get(idx - 1);
      const model = trackRef.current;
      const cv = canvasRef.current;

      if (cv && model) {
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
          const proj = makeProjector(camRef.current, w, CANVAS_H, model.R);
          drawTrack(ctx, proj, model);

          hitRef.current.clear();
          if (chunk) {
            const cars: {
              dn: number;
              world: { x: number; y: number; z: number };
              stale: boolean;
              depth: number;
            }[] = [];
            for (const d of drivers) {
              const pos = samplePos(
                chunk.get(d.driver_number),
                prevChunk?.get(d.driver_number),
                t,
              );
              if (!pos) continue;
              const world = model.toWorld(pos.x, pos.y, pos.z);
              cars.push({
                dn: d.driver_number,
                world,
                stale: pos.stale,
                depth: proj.depth(world),
              });
            }
            cars.sort((a, b) => b.depth - a.depth); // far first
            const fdn = focusRef.current;
            for (const c of cars) {
              const d = byNum.get(c.dn);
              const color = teamColor(d?.team_colour);
              if (c.dn === fdn) drawBeacon(ctx, proj, c.world, color, now);
              const sp = drawCar(ctx, proj, c.world, color, {
                label: labelsRef.current ? d?.name_acronym : undefined,
                alpha: c.stale ? 0.2 : 1,
                focused: c.dn === fdn,
              });
              hitRef.current.set(c.dn, sp);
            }
          }
        }
      }

      const fdn = focusRef.current;
      if (fdn != null) {
        void loadCarChunk(idx, fdn);
        if (t - (t0 + idx * CHUNK_MS) > CHUNK_MS * 0.5) {
          void loadCarChunk(idx + 1, fdn);
        }
        const s = sampleCar(
          carChunks.current.get(`${fdn}:${idx}`),
          carChunks.current.get(`${fdn}:${idx - 1}`),
          t,
        );
        const g = gaugeRefs.current;
        if (s && g.speed) {
          g.speed.textContent = String(Math.round(s.speed));
          if (g.rpm) g.rpm.textContent = String(Math.round(s.rpm));
          if (g.gear) g.gear.textContent = s.gear > 0 ? String(s.gear) : "N";
          if (g.thr) g.thr.style.width = `${Math.min(100, Math.max(0, s.thr))}%`;
          if (g.brk) g.brk.style.width = `${Math.min(100, Math.max(0, s.brk))}%`;
          if (g.drs) {
            g.drs.style.background = s.drs ? "#22c55e" : "transparent";
            g.drs.style.color = s.drs ? "#04210f" : "#8b8b98";
          }
        }
      }

      const isBuffering = !locChunks.current.has(idx);
      if (isBuffering !== wasBuffering) {
        wasBuffering = isBuffering;
        setBuffering(isBuffering);
      }
      if (now - lastUi > 250) {
        lastUi = now;
        setClock(Math.floor((t - t0) / 1000));
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [t0, t1, drivers, byNum, loadLocChunk, loadCarChunk]);

  // ---- leaderboard at the playhead (4Hz is plenty) ----
  const sortedPositions = useMemo(
    () =>
      positions
        .map((p) => ({ t: Date.parse(p.date), dn: p.driver_number, pos: p.position }))
        .sort((a, b) => a.t - b.t),
    [positions],
  );

  const order = useMemo(() => {
    const t = t0 + clock * 1000;
    const posAt = new Map<number, number>();
    for (const p of sortedPositions) {
      if (p.t > t) break;
      posAt.set(p.dn, p.pos);
    }
    return [...drivers]
      .sort(
        (a, b) =>
          (posAt.get(a.driver_number) ?? 99) -
          (posAt.get(b.driver_number) ?? 99),
      )
      .map((d) => ({ d, pos: posAt.get(d.driver_number) ?? null }));
  }, [drivers, sortedPositions, clock, t0]);

  const focusDriver = focus != null
    ? drivers.find((d) => d.driver_number === focus) ?? null
    : null;

  if (trackErr) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Replay unavailable: {trackErr}
      </p>
    );
  }
  if (!track) {
    return (
      <p className="animate-pulse py-8 text-center text-sm text-muted">
        Tracing circuit from GPS data…
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)_230px]">
      {/* position tower */}
      <div className="max-h-[600px] overflow-y-auto rounded-xl border border-line bg-surface p-2 self-start">
        <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted">
          Positions
        </p>
        {order.map(({ d, pos }) => (
          <button
            key={d.driver_number}
            onClick={() =>
              setFocus(focus === d.driver_number ? null : d.driver_number)
            }
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors ${
              focus === d.driver_number
                ? "bg-surface-2"
                : "hover:bg-surface-2/50"
            }`}
          >
            <span className="w-5 text-right font-mono text-xs text-muted">
              {pos ?? "—"}
            </span>
            <span
              className="h-3.5 w-1 rounded-sm"
              style={{ background: teamColor(d.team_colour) }}
            />
            <span className="font-mono text-xs font-semibold">
              {d.name_acronym}
            </span>
          </button>
        ))}
      </div>

      {/* 3D track + controls */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ height: CANVAS_H, touchAction: "none" }}
            className="w-full cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              if (!drag) return;
              const dx = e.clientX - drag.x;
              const dy = e.clientY - drag.y;
              if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
              drag.x = e.clientX;
              drag.y = e.clientY;
              const c = camRef.current;
              c.yaw += dx * 0.006;
              c.pitch = Math.min(1.25, Math.max(0, c.pitch + dy * 0.005));
            }}
            onPointerUp={(e) => {
              const drag = dragRef.current;
              dragRef.current = null;
              if (drag?.moved) return;
              // click: focus the nearest car
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              const mx = e.clientX - rect.left;
              const my = e.clientY - rect.top;
              let best: number | null = null;
              let bestD = 16;
              for (const [dn, [sx, sy]] of hitRef.current) {
                const d = Math.hypot(sx - mx, sy - my);
                if (d < bestD) {
                  bestD = d;
                  best = dn;
                }
              }
              if (best != null) setFocus(focus === best ? null : best);
            }}
          />
          {buffering && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="animate-pulse rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted">
                Buffering GPS data…
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/70 px-2 py-1 text-[10px] text-muted">
            drag to rotate · scroll to zoom
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button
            onClick={() => setPlaying(!playing)}
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
            max={durationS}
            value={clock}
            onChange={(e) => {
              const s = Number(e.target.value);
              timeRef.current = t0 + s * 1000;
              setClock(s);
            }}
            className="min-w-40 flex-1 accent-(--accent)"
          />
          <span className="font-mono text-xs text-muted">
            {fmtClock(clock)} / {fmtClock(durationS)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => {
              camRef.current.pitch = 0;
            }}
            className="rounded border border-line px-2 py-1 text-muted hover:text-foreground"
          >
            Top-down
          </button>
          <button
            onClick={() => {
              camRef.current.pitch = DEFAULT_PITCH;
            }}
            className="rounded border border-line px-2 py-1 text-muted hover:text-foreground"
          >
            3D
          </button>
          <button
            onClick={() => {
              camRef.current = { yaw: 0, pitch: DEFAULT_PITCH, zoom: 1 };
            }}
            className="rounded border border-line px-2 py-1 text-muted hover:text-foreground"
          >
            Reset view
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="accent-(--accent)"
            />
            Labels
          </label>
        </div>
      </div>

      {/* focused-driver gauge */}
      <div className="self-start rounded-xl border border-line bg-surface p-4">
        {focusDriver ? (
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-1.5 rounded-sm"
                  style={{ background: teamColor(focusDriver.team_colour) }}
                />
                <span className="font-semibold">
                  {focusDriver.name_acronym}
                </span>
                <span className="text-xs text-muted">
                  {focusDriver.team_name}
                </span>
              </div>
              <button
                onClick={() => setFocus(null)}
                className="text-muted hover:text-foreground"
                title="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 text-center">
              <span
                className="font-mono text-5xl font-bold tabular-nums"
                ref={(el) => {
                  gaugeRefs.current.speed = el;
                }}
              >
                0
              </span>
              <span className="ml-1 text-xs text-muted">km/h</span>
            </div>

            <div className="mt-3 flex items-center justify-center gap-4">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  Gear
                </p>
                <span
                  className="font-mono text-2xl font-semibold"
                  ref={(el) => {
                    gaugeRefs.current.gear = el;
                  }}
                >
                  N
                </span>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  RPM
                </p>
                <span
                  className="font-mono text-2xl font-semibold tabular-nums"
                  ref={(el) => {
                    gaugeRefs.current.rpm = el;
                  }}
                >
                  0
                </span>
              </div>
              <span
                className="rounded border border-line px-2 py-1 font-mono text-xs font-semibold"
                ref={(el) => {
                  gaugeRefs.current.drs = el;
                }}
              >
                DRS
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  Throttle
                </p>
                <div className="h-2 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full bg-green-500 transition-none"
                    style={{ width: 0 }}
                    ref={(el) => {
                      gaugeRefs.current.thr = el;
                    }}
                  />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  Brake
                </p>
                <div className="h-2 overflow-hidden rounded bg-surface-2">
                  <div
                    className="h-full bg-red-500 transition-none"
                    style={{ width: 0 }}
                    ref={(el) => {
                      gaugeRefs.current.brk = el;
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted">
            Click a car on the map or a row in the position tower to see its
            live telemetry. The focused car gets a light beacon.
          </p>
        )}
      </div>
    </div>
  );
}
