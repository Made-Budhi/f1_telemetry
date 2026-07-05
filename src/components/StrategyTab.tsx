"use client";

import { useMemo } from "react";
import {
  COMPOUND_COLORS,
  COMPOUND_TEXT,
  fmtLap,
  teamColor,
} from "@/lib/format";
import type {
  Driver,
  Lap,
  PositionEntry,
  Session,
  Stint,
} from "@/lib/types";

// OpenF1's `pit` endpoint moved behind authentication, so pit stops are
// derived from stint boundaries instead: the in-lap is the previous stint's
// last lap, and "time lost" compares in-lap + out-lap against clean pace.

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface DerivedStop {
  d: Driver;
  inLap: number;
  compound: string | null;
  loss: number | null;
}

interface StintRow {
  d: Driver;
  s: Stint;
  n: number;
  avg: number | null;
  deg: number | null;
}

export default function StrategyTab({
  drivers,
  laps,
  stints,
  positions,
}: {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
  stints: Stint[];
  positions: PositionEntry[];
}) {
  const ordered = useMemo(() => {
    const finalPos = new Map<number, number>();
    for (const p of [...positions].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    )) {
      finalPos.set(p.driver_number, p.position);
    }
    return [...drivers].sort(
      (a, b) =>
        (finalPos.get(a.driver_number) ?? 99) -
        (finalPos.get(b.driver_number) ?? 99),
    );
  }, [drivers, positions]);

  const { stops, stintRows } = useMemo(() => {
    const lapsBy = new Map<number, Map<number, Lap>>();
    for (const l of laps) {
      const m = lapsBy.get(l.driver_number) ?? new Map<number, Lap>();
      m.set(l.lap_number, l);
      lapsBy.set(l.driver_number, m);
    }

    const stops: DerivedStop[] = [];
    const stintRows: StintRow[] = [];

    for (const d of ordered) {
      const ds = stints
        .filter((s) => s.driver_number === d.driver_number)
        .sort((a, b) => a.stint_number - b.stint_number);
      const dl = lapsBy.get(d.driver_number) ?? new Map<number, Lap>();

      // in-laps: last lap of every stint that has a successor
      const inLaps = new Set<number>();
      for (let i = 0; i < ds.length - 1; i++) inLaps.add(ds[i].lap_end);

      const isClean = (l: Lap) =>
        l.lap_duration != null && !l.is_pit_out_lap && !inLaps.has(l.lap_number);

      const allClean = [...dl.values()].filter(isClean).map((l) => l.lap_duration!);
      const med0 = median(allClean);
      const cleanMed = median(
        med0 != null ? allClean.filter((v) => v <= med0 * 1.05) : allClean,
      );

      for (let i = 1; i < ds.length; i++) {
        const inLap = dl.get(ds[i - 1].lap_end);
        const outLap = dl.get(ds[i].lap_start);
        const loss =
          inLap?.lap_duration != null &&
          outLap?.lap_duration != null &&
          cleanMed != null
            ? inLap.lap_duration + outLap.lap_duration - 2 * cleanMed
            : null;
        stops.push({
          d,
          inLap: ds[i - 1].lap_end,
          compound: ds[i].compound,
          loss,
        });
      }

      for (const s of ds) {
        const inStint = [...dl.values()].filter(
          (l) => l.lap_number >= s.lap_start && l.lap_number <= s.lap_end && isClean(l),
        );
        const med = median(inStint.map((l) => l.lap_duration!));
        const clean =
          med != null
            ? inStint.filter((l) => l.lap_duration! <= med * 1.05)
            : inStint;
        const n = clean.length;
        let avg: number | null = null;
        let deg: number | null = null;
        if (n) avg = clean.reduce((a, l) => a + l.lap_duration!, 0) / n;
        if (n >= 4) {
          const mx = clean.reduce((a, l) => a + l.lap_number, 0) / n;
          let num = 0;
          let den = 0;
          for (const l of clean) {
            num += (l.lap_number - mx) * (l.lap_duration! - avg!);
            den += (l.lap_number - mx) ** 2;
          }
          if (den > 0) deg = num / den;
        }
        stintRows.push({ d, s, n, avg, deg });
      }
    }

    stops.sort((a, b) => a.inLap - b.inLap);
    return { stops, stintRows };
  }, [ordered, stints, laps]);

  const compoundChip = (compound: string | null) => {
    const comp = (compound ?? "UNKNOWN").toUpperCase();
    return (
      <span
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{
          background: COMPOUND_COLORS[comp] ?? COMPOUND_COLORS.UNKNOWN,
          color: COMPOUND_TEXT[comp] ?? "#111",
        }}
      >
        {comp}
      </span>
    );
  };

  const driverCell = (d: Driver) => (
    <>
      <span
        className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
        style={{ background: teamColor(d.team_colour) }}
      />
      <span className="font-mono text-xs font-semibold">{d.name_acronym}</span>
    </>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="self-start overflow-x-auto rounded-xl border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
          Pit stops
        </h3>
        {stops.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No tyre changes in this session.
          </p>
        ) : (
          <>
            <table className="w-full min-w-[380px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2 font-medium">In-lap</th>
                  <th className="px-2 py-2 font-medium">Driver</th>
                  <th className="px-2 py-2 font-medium">New tyre</th>
                  <th className="px-4 py-2 text-right font-medium">
                    Time lost
                  </th>
                </tr>
              </thead>
              <tbody>
                {stops.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-4 py-1.5 font-mono text-xs text-muted">
                      L{p.inLap}
                    </td>
                    <td className="px-2 py-1.5">{driverCell(p.d)}</td>
                    <td className="px-2 py-1.5">{compoundChip(p.compound)}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-[13px]">
                      {p.loss == null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        `~${p.loss.toFixed(1)}s`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Time lost = in-lap + out-lap vs 2× the driver&apos;s clean median
              lap. Safety-car pit stops show smaller (sometimes negative)
              losses because the field is slow anyway.
            </p>
          </>
        )}
      </section>

      <section className="self-start overflow-x-auto rounded-xl border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
          Stint pace
        </h3>
        {stintRows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No stint data.</p>
        ) : (
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-medium">Driver</th>
                <th className="px-2 py-2 font-medium">Tyre</th>
                <th className="px-2 py-2 text-right font-medium">Laps</th>
                <th className="px-2 py-2 text-right font-medium">Clean</th>
                <th className="px-2 py-2 text-right font-medium">Avg pace</th>
                <th className="px-4 py-2 text-right font-medium">Deg / lap</th>
              </tr>
            </thead>
            <tbody>
              {stintRows.map((r) => (
                <tr
                  key={`${r.d.driver_number}-${r.s.stint_number}`}
                  className="border-t border-line"
                >
                  <td className="px-4 py-1.5">{driverCell(r.d)}</td>
                  <td className="px-2 py-1.5">{compoundChip(r.s.compound)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {r.s.lap_start}–{r.s.lap_end}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {r.n}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[13px]">
                    {fmtLap(r.avg)}
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono text-xs">
                    {r.deg == null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span
                        className={
                          r.deg > 0.05 ? "text-amber-400" : "text-green-400"
                        }
                      >
                        {r.deg > 0 ? "+" : ""}
                        {r.deg.toFixed(3)}s
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          Avg over clean laps only (pit in/out laps and &gt;105% of stint
          median excluded). Deg = linear-fit slope over clean laps; needs ≥4.
        </p>
      </section>
    </div>
  );
}
