/**
 * Lightweight 3D track renderer for canvas — orthographic projection with
 * yaw/pitch/zoom, real elevation from OpenF1's z channel (exaggerated so
 * it reads at track scale), and beacon/car drawing helpers shared by the
 * session replay and ghost race.
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackModel {
  pts: P3[];
  R: number; // bounding radius in world units, for fit-to-view
  toWorld: (x: number, y: number, z: number) => P3;
}

const Z_EXAGGERATION = 3.5;
const MAX_Z_WORLD = 0.55;

export function buildTrackModel(
  rows: { x: number; y: number; z: number }[],
): TrackModel | null {
  const raw = rows.filter((r) => r.x !== 0 || r.y !== 0);
  if (raw.length < 50) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const zs: number[] = [];
  for (const p of raw) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    zs.push(p.z ?? 0);
  }
  zs.sort((a, b) => a - b);
  const z0 = zs[Math.floor(zs.length / 2)];
  const zSpanHalf = Math.max(
    Math.abs(zs[0] - z0),
    Math.abs(zs[zs.length - 1] - z0),
  );

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 2 / Math.max(maxX - minX, maxY - minY, 1);
  // exaggerate elevation so it reads, but cap so weird z data can't explode
  const zScale =
    zSpanHalf > 0
      ? Math.min(scale * Z_EXAGGERATION, MAX_Z_WORLD / zSpanHalf)
      : 0;

  const toWorld = (x: number, y: number, z: number): P3 => ({
    x: (x - cx) * scale,
    y: (y - cy) * scale,
    z: ((z ?? z0) - z0) * zScale,
  });

  const pts = raw.map((p) => toWorld(p.x, p.y, p.z));
  let R = 0;
  for (const p of pts) R = Math.max(R, Math.hypot(p.x, p.y));
  return { pts, R: Math.max(R, 0.5), toWorld };
}

export interface Camera {
  yaw: number;
  pitch: number; // 0 = top-down, ~1.25 = near side-on
  zoom: number;
}

export interface Projector {
  k: number;
  sp: number;
  cp: number;
  p: (pt: P3) => [number, number];
  depth: (pt: P3) => number;
}

export function makeProjector(
  cam: Camera,
  w: number,
  h: number,
  R: number,
): Projector {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const kw = (w / 2 - 24) / R;
  const kh = (h / 2 - 30) / Math.max(R * cp + 0.45 * sp, 0.35);
  const k = Math.min(kw, kh) * cam.zoom;
  return {
    k,
    sp,
    cp,
    p: (pt: P3) => {
      const xr = pt.x * cy - pt.y * sy;
      const yr = pt.x * sy + pt.y * cy;
      // tilt compresses the ground plane; elevation lifts points up-screen
      return [
        w / 2 + xr * k,
        h / 2 - (yr * cp + pt.z * sp) * k + sp * k * 0.1,
      ];
    },
    depth: (pt: P3) => pt.x * sy + pt.y * cy,
  };
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  proj: Projector,
  model: TrackModel,
) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const trace = (flat: boolean) => {
    ctx.beginPath();
    for (let i = 0; i < model.pts.length; i++) {
      const pt = model.pts[i];
      const [sx, sy] = proj.p(flat ? { x: pt.x, y: pt.y, z: 0 } : pt);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
  };

  // ground shadow separates elevated sections from the floor
  if (proj.sp > 0.15) {
    trace(true);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 13;
    ctx.stroke();
  }

  trace(false);
  ctx.strokeStyle = "#2e2e3a";
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = "#5a5a72";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  const [sx, sy] = proj.p(model.pts[0]);
  ctx.fillStyle = "#e10600";
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Beacon highlight: a pulsing vertical light column (white-hot base fading
 * into the team colour). Falls back to a pulsing ground halo in top-down
 * view, where a vertical line would project to a point.
 */
export function drawBeacon(
  ctx: CanvasRenderingContext2D,
  proj: Projector,
  p: P3,
  color: string,
  now: number,
) {
  const pulse = 0.7 + 0.3 * Math.sin(now / 320);
  if (proj.sp < 0.15) {
    const [sx, sy] = proj.p(p);
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 17);
    g.addColorStop(0, `rgba(255,255,255,${0.5 * pulse})`);
    g.addColorStop(0.45, hexA(color, 0.35 * pulse));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 17, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const base = proj.p(p);
  const top = proj.p({ x: p.x, y: p.y, z: p.z + 0.34 });
  const g = ctx.createLinearGradient(base[0], base[1], top[0], top[1]);
  g.addColorStop(0, `rgba(255,255,255,${0.9 * pulse})`);
  g.addColorStop(0.35, hexA(color, 0.7 * pulse));
  g.addColorStop(1, hexA(color, 0));
  ctx.save();
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * pulse;
  ctx.beginPath();
  ctx.moveTo(base[0], base[1]);
  ctx.lineTo(top[0], top[1]);
  ctx.stroke();
  ctx.restore();
}

export function drawCar(
  ctx: CanvasRenderingContext2D,
  proj: Projector,
  p: P3,
  color: string,
  opts: { label?: string; alpha?: number; focused?: boolean } = {},
): [number, number] {
  const [sx, sy] = proj.p(p);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0a0a0f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, opts.focused ? 7.5 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (opts.focused) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.label) {
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.strokeStyle = "rgba(10,10,15,0.9)";
    ctx.lineWidth = 3;
    ctx.strokeText(opts.label, sx + 10, sy + 4);
    ctx.fillStyle = "#e2e2ea";
    ctx.fillText(opts.label, sx + 10, sy + 4);
  }
  ctx.restore();
  return [sx, sy];
}
