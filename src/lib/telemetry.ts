import type { CarSample } from "./types";

/**
 * OpenF1 car_data has no distance channel, so we integrate speed over time
 * (trapezoidal) to get cumulative lap distance — the same approach FastF1
 * uses. Good enough for trace comparison; expect a few metres of drift.
 */

export interface DriverChannels {
  maxDist: number;
  dist: number[];
  time: number[];
  speed: number[];
  throttle: number[];
  brake: number[];
  rpm: number[];
  gear: number[];
  drs: number[];
}

export interface AlignedChannels {
  time: (number | null)[];
  speed: (number | null)[];
  throttle: (number | null)[];
  brake: (number | null)[];
  rpm: (number | null)[];
  gear: (number | null)[];
  drs: (number | null)[];
}

const DRS_ON = new Set([10, 12, 14]);

export function integrate(
  samples: CarSample[],
  startMs?: number,
): DriverChannels | null {
  const pts = samples
    .map((s) => ({ ...s, t: Date.parse(s.date) }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  // Anchor to the lap start when given: the first sample lands up to ~270ms
  // after the line, and that offset differs per car — without this, two
  // drivers' time/distance bases disagree and cross-car deltas skew.
  const t0 = startMs != null && Number.isFinite(startMs) ? startMs : pts[0].t;
  const headStart = Math.max(0, (pts[0].t - t0) / 1000);

  const dist: number[] = [(pts[0].speed / 3.6) * headStart];
  const time: number[] = [(pts[0].t - t0) / 1000];
  const speed: number[] = [pts[0].speed];
  const throttle: number[] = [pts[0].throttle];
  const brake: number[] = [pts[0].brake];
  const rpm: number[] = [pts[0].rpm];
  const gear: number[] = [pts[0].n_gear];
  const drs: number[] = [DRS_ON.has(pts[0].drs) ? 1 : 0];

  let d = dist[0];
  for (let i = 1; i < pts.length; i++) {
    // clamp dt so a data gap doesn't teleport the car down the road
    const dt = Math.min(Math.max((pts[i].t - pts[i - 1].t) / 1000, 0), 2);
    d += ((pts[i].speed + pts[i - 1].speed) / 2 / 3.6) * dt;
    dist.push(d);
    time.push((pts[i].t - t0) / 1000);
    speed.push(pts[i].speed);
    throttle.push(pts[i].throttle);
    brake.push(pts[i].brake);
    rpm.push(pts[i].rpm);
    gear.push(pts[i].n_gear);
    drs.push(DRS_ON.has(pts[i].drs) ? 1 : 0);
  }
  return { maxDist: d, dist, time, speed, throttle, brake, rpm, gear, drs };
}

/**
 * Resample every driver onto a shared distance grid so uPlot can overlay
 * them with a single x-axis. Continuous channels are linearly interpolated;
 * discrete ones (gear, DRS, brake) hold the previous sample.
 */
export function align(
  channelsList: DriverChannels[],
  step = 10,
): { xs: number[]; perDriver: AlignedChannels[] } {
  const maxDist = Math.max(...channelsList.map((c) => c.maxDist));
  const n = Math.max(2, Math.floor(maxDist / step) + 1);
  const xs = Array.from({ length: n }, (_, i) => i * step);

  const perDriver = channelsList.map((c) => {
    const out: AlignedChannels = {
      time: [],
      speed: [],
      throttle: [],
      brake: [],
      rpm: [],
      gear: [],
      drs: [],
    };
    let j = 0;
    for (const x of xs) {
      if (x > c.maxDist) {
        out.time.push(null);
        out.speed.push(null);
        out.throttle.push(null);
        out.brake.push(null);
        out.rpm.push(null);
        out.gear.push(null);
        out.drs.push(null);
        continue;
      }
      while (j < c.dist.length - 2 && c.dist[j + 1] < x) j++;
      const j2 = Math.min(j + 1, c.dist.length - 1);
      const d0 = c.dist[j];
      const d1 = c.dist[j2];
      const f = d1 > d0 ? Math.min(Math.max((x - d0) / (d1 - d0), 0), 1) : 0;
      const lerp = (arr: number[]) => arr[j] + (arr[j2] - arr[j]) * f;
      out.time.push(lerp(c.time));
      out.speed.push(lerp(c.speed));
      out.throttle.push(lerp(c.throttle));
      out.rpm.push(lerp(c.rpm));
      out.brake.push(c.brake[j]);
      out.gear.push(c.gear[j]);
      out.drs.push(c.drs[j]);
    }
    return out;
  });

  return { xs, perDriver };
}
