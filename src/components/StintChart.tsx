"use client";

import { useMemo } from "react";
import { COMPOUND_COLORS, COMPOUND_TEXT, teamColor } from "@/lib/format";
import type { Driver, PositionEntry, Stint } from "@/lib/types";

const LEGEND = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];

export default function StintChart({
  drivers,
  stints,
  positions,
}: {
  drivers: Driver[];
  stints: Stint[];
  positions: PositionEntry[];
}) {
  const { ordered, byDriver, totalLaps } = useMemo(() => {
    const byDriver = new Map<number, Stint[]>();
    for (const s of stints) {
      const arr = byDriver.get(s.driver_number);
      if (arr) arr.push(s);
      else byDriver.set(s.driver_number, [s]);
    }
    for (const arr of byDriver.values()) {
      arr.sort((a, b) => a.stint_number - b.stint_number);
    }
    const finalPos = new Map<number, number>();
    for (const p of [...positions].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    )) {
      finalPos.set(p.driver_number, p.position);
    }
    const ordered = [...drivers].sort(
      (a, b) =>
        (finalPos.get(a.driver_number) ?? 99) -
        (finalPos.get(b.driver_number) ?? 99),
    );
    const totalLaps = Math.max(1, ...stints.map((s) => s.lap_end));
    return { ordered, byDriver, totalLaps };
  }, [drivers, stints, positions]);

  if (!stints.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No stint data for this session.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium">Tyre stints</h3>
      <div className="space-y-1.5">
        {ordered.map((d) => {
          const ds = byDriver.get(d.driver_number) ?? [];
          return (
            <div key={d.driver_number} className="flex items-center gap-2">
              <span
                className="w-12 shrink-0 text-right font-mono text-xs font-semibold"
                style={{ color: teamColor(d.team_colour) }}
              >
                {d.name_acronym}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-surface-2">
                {ds.map((s) => {
                  const left = ((s.lap_start - 1) / totalLaps) * 100;
                  const width = Math.max(
                    0.5,
                    ((s.lap_end - s.lap_start + 1) / totalLaps) * 100,
                  );
                  const comp = (s.compound ?? "UNKNOWN").toUpperCase();
                  const len = s.lap_end - s.lap_start + 1;
                  return (
                    <div
                      key={s.stint_number}
                      title={`${comp} · laps ${s.lap_start}–${s.lap_end} (${len}) · ${
                        s.tyre_age_at_start ?? "?"
                      } laps old at start`}
                      className="absolute top-0 flex h-full items-center justify-center border-r border-background text-[10px] font-semibold"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: COMPOUND_COLORS[comp] ?? COMPOUND_COLORS.UNKNOWN,
                        color: COMPOUND_TEXT[comp] ?? "#111",
                      }}
                    >
                      {width > 7 ? `${comp[0]} ${len}` : ""}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          {LEGEND.map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: COMPOUND_COLORS[c] }}
              />
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
        <span className="text-xs text-muted">{totalLaps} laps</span>
      </div>
    </div>
  );
}
