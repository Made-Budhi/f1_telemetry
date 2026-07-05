import type { Driver } from "./types";

/** 92.456 -> "1:32.456" */
export function fmtLap(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

/** Compact tick label: 92.4 -> "1:32.4" */
export function fmtLapTick(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, "0");
  return m > 0 ? `${m}:${s}` : s;
}

export function fmtSector(sec: number | null | undefined): string {
  return sec == null ? "—" : sec.toFixed(3);
}

export function fmtGap(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  return sec <= 0 ? "—" : `+${sec.toFixed(3)}`;
}

export function fmtDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
  return `${date} · ${time} UTC`;
}

/** OpenF1 sends team colours as "3671C6" (no #), and sometimes null. */
export function teamColor(
  hex: string | null | undefined,
  fallback = "#9ca3af",
): string {
  if (!hex) return fallback;
  const h = hex.startsWith("#") ? hex : `#${hex}`;
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h : fallback;
}

/**
 * Stable stroke per driver; the second driver sharing a team colour gets a
 * dashed line so teammates stay distinguishable on charts.
 */
export function buildColorMap(
  drivers: Driver[],
): Map<number, { stroke: string; dash?: number[] }> {
  const used = new Map<string, number>();
  const out = new Map<number, { stroke: string; dash?: number[] }>();
  for (const d of drivers) {
    const c = teamColor(d.team_colour);
    const n = used.get(c) ?? 0;
    used.set(c, n + 1);
    out.set(d.driver_number, { stroke: c, dash: n > 0 ? [8, 5] : undefined });
  }
  return out;
}

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#ef4444",
  MEDIUM: "#eab308",
  HARD: "#e5e7eb",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
  UNKNOWN: "#71717a",
  TEST_UNKNOWN: "#71717a",
};

export const COMPOUND_TEXT: Record<string, string> = {
  SOFT: "#ffffff",
  MEDIUM: "#111111",
  HARD: "#111111",
  INTERMEDIATE: "#111111",
  WET: "#ffffff",
  UNKNOWN: "#ffffff",
  TEST_UNKNOWN: "#ffffff",
};

/** Jolpica constructorId -> brand colour (cosmetic; fallback grey). */
export const TEAM_COLORS: Record<string, string> = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mercedes: "#27F4D2",
  mclaren: "#FF8000",
  aston_martin: "#229971",
  alpine: "#0093CC",
  williams: "#64C4FF",
  rb: "#6692FF",
  sauber: "#52E252",
  audi: "#F50537",
  haas: "#B6BABD",
  cadillac: "#C8A664",
};

export function constructorColor(id: string | undefined): string {
  return (id && TEAM_COLORS[id]) || "#71717a";
}

// Shared uPlot dark-theme colours
export const CHART_AXIS = "#8b8b98";
export const CHART_GRID = "#222229";
