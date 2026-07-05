"use client";

import { useMemo } from "react";
import { fmtGap, fmtLap, fmtSector, teamColor } from "@/lib/format";
import type { Driver, Lap, PositionEntry } from "@/lib/types";

interface Row {
  d: Driver;
  best: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  st: number | null;
  lapCount: number;
  pos: number | null;
}

function minOf(vals: (number | null)[]): number | null {
  return vals.reduce<number | null>(
    (acc, v) => (v != null && (acc == null || v < acc) ? v : acc),
    null,
  );
}

function maxOf(vals: (number | null)[]): number | null {
  return vals.reduce<number | null>(
    (acc, v) => (v != null && (acc == null || v > acc) ? v : acc),
    null,
  );
}

export default function TimingTable({
  drivers,
  laps,
  positions,
  sessionType,
}: {
  drivers: Driver[];
  laps: Lap[];
  positions: PositionEntry[];
  sessionType: string;
}) {
  const rows = useMemo<Row[]>(() => {
    const byDriver = new Map<number, Lap[]>();
    for (const l of laps) {
      const arr = byDriver.get(l.driver_number);
      if (arr) arr.push(l);
      else byDriver.set(l.driver_number, [l]);
    }
    const finalPos = new Map<number, number>();
    for (const p of [...positions].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    )) {
      finalPos.set(p.driver_number, p.position);
    }
    const out = drivers.map((d) => {
      const dl = byDriver.get(d.driver_number) ?? [];
      return {
        d,
        best: minOf(dl.map((l) => l.lap_duration)),
        s1: minOf(dl.map((l) => l.duration_sector_1)),
        s2: minOf(dl.map((l) => l.duration_sector_2)),
        s3: minOf(dl.map((l) => l.duration_sector_3)),
        st: maxOf(dl.map((l) => l.st_speed)),
        lapCount: dl.filter((l) => l.lap_duration != null).length,
        pos: finalPos.get(d.driver_number) ?? null,
      };
    });
    const isRace = sessionType === "Race";
    out.sort((a, b) =>
      isRace
        ? (a.pos ?? 99) - (b.pos ?? 99)
        : (a.best ?? Infinity) - (b.best ?? Infinity),
    );
    return out;
  }, [drivers, laps, positions, sessionType]);

  const bests = useMemo(
    () => ({
      lap: minOf(rows.map((r) => r.best)),
      s1: minOf(rows.map((r) => r.s1)),
      s2: minOf(rows.map((r) => r.s2)),
      s3: minOf(rows.map((r) => r.s3)),
    }),
    [rows],
  );

  const timeCell = (
    v: number | null,
    best: number | null,
    fmt: (n: number | null) => string,
  ) => (
    <td
      className={`px-2 py-2 text-right font-mono text-[13px] ${
        v != null && v === best ? "font-semibold text-fuchsia-400" : ""
      }`}
    >
      {fmt(v)}
    </td>
  );

  if (!rows.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No timing data for this session.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2.5 font-medium">P</th>
            <th className="px-2 py-2.5 font-medium">Driver</th>
            <th className="px-2 py-2.5 font-medium">Team</th>
            <th className="px-2 py-2.5 text-right font-medium">Best lap</th>
            <th className="px-2 py-2.5 text-right font-medium">Gap</th>
            <th className="px-2 py-2.5 text-right font-medium">S1</th>
            <th className="px-2 py-2.5 text-right font-medium">S2</th>
            <th className="px-2 py-2.5 text-right font-medium">S3</th>
            <th className="px-2 py-2.5 text-right font-medium">ST km/h</th>
            <th className="px-3 py-2.5 text-right font-medium">Laps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.d.driver_number}
              className="border-t border-line hover:bg-surface-2/50"
            >
              <td className="px-3 py-2 font-mono text-xs text-muted">
                {i + 1}
              </td>
              <td className="px-2 py-2">
                <span
                  className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
                  style={{ background: teamColor(r.d.team_colour) }}
                />
                <span className="font-semibold">{r.d.name_acronym}</span>
                <span className="ml-2 hidden text-xs text-muted md:inline">
                  {r.d.full_name}
                </span>
              </td>
              <td className="px-2 py-2 text-xs text-muted">{r.d.team_name}</td>
              {timeCell(r.best, bests.lap, fmtLap)}
              <td className="px-2 py-2 text-right font-mono text-[13px] text-muted">
                {r.best != null && bests.lap != null
                  ? fmtGap(r.best - bests.lap)
                  : "—"}
              </td>
              {timeCell(r.s1, bests.s1, fmtSector)}
              {timeCell(r.s2, bests.s2, fmtSector)}
              {timeCell(r.s3, bests.s3, fmtSector)}
              <td className="px-2 py-2 text-right font-mono text-[13px]">
                {r.st != null ? Math.round(r.st) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-[13px]">
                {r.lapCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        Purple = overall best. Sectors are each driver&apos;s best individual
        sector, so they may not sum to the best lap.
      </p>
    </div>
  );
}
