"use client";

import { useMemo, useState } from "react";
import uPlot from "uplot";
import UplotChart from "./UplotChart";
import {
  buildColorMap,
  CHART_AXIS,
  CHART_GRID,
  fmtLap,
  fmtLapTick,
} from "@/lib/format";
import type { Driver, Lap } from "@/lib/types";

export default function LapChart({
  drivers,
  laps,
}: {
  drivers: Driver[];
  laps: Lap[];
}) {
  const [hideOutliers, setHideOutliers] = useState(true);
  const colors = useMemo(() => buildColorMap(drivers), [drivers]);

  const { data, options, empty } = useMemo(() => {
    const sel = new Set(drivers.map((d) => d.driver_number));
    const byDriver = new Map<number, Lap[]>();
    let maxLap = 0;
    for (const l of laps) {
      if (!sel.has(l.driver_number)) continue;
      maxLap = Math.max(maxLap, l.lap_number);
      const arr = byDriver.get(l.driver_number);
      if (arr) arr.push(l);
      else byDriver.set(l.driver_number, [l]);
    }

    const xs = Array.from({ length: maxLap }, (_, i) => i + 1);
    const ys: (number | null)[][] = drivers.map((d) => {
      const dl = byDriver.get(d.driver_number) ?? [];
      const durations = dl
        .map((l) => l.lap_duration)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const median = durations.length
        ? durations[Math.floor(durations.length / 2)]
        : null;
      const y: (number | null)[] = new Array(maxLap).fill(null);
      for (const l of dl) {
        if (l.lap_duration == null) continue;
        if (
          hideOutliers &&
          (l.is_pit_out_lap ||
            (median != null && l.lap_duration > median * 1.08))
        ) {
          continue;
        }
        y[l.lap_number - 1] = l.lap_duration;
      }
      return y;
    });

    const empty = ys.every((y) => y.every((v) => v == null));

    const options: Omit<uPlot.Options, "width"> = {
      height: 360,
      scales: { x: { time: false } },
      cursor: { points: { show: true } },
      axes: [
        {
          stroke: CHART_AXIS,
          grid: { stroke: CHART_GRID },
          ticks: { stroke: CHART_GRID },
          label: "Lap",
        },
        {
          stroke: CHART_AXIS,
          grid: { stroke: CHART_GRID },
          ticks: { stroke: CHART_GRID },
          size: 64,
          values: (u, splits) => splits.map((v) => fmtLapTick(v)),
        },
      ],
      series: [
        { label: "Lap" },
        ...drivers.map((d) => {
          const c = colors.get(d.driver_number);
          return {
            label: d.name_acronym,
            stroke: c?.stroke ?? "#999",
            dash: c?.dash,
            width: 1.6,
            points: { show: true, size: 5 },
            value: (u: uPlot, v: number) => (v == null ? "—" : fmtLap(v)),
          } as uPlot.Series;
        }),
      ],
    };

    return {
      data: [xs, ...ys] as unknown as uPlot.AlignedData,
      options,
      empty,
    };
  }, [drivers, laps, hideOutliers, colors]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Lap time comparison</h3>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={hideOutliers}
            onChange={(e) => setHideOutliers(e.target.checked)}
            className="accent-(--accent)"
          />
          Hide pit &amp; outlier laps
        </label>
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted">
          No lap data for the selected drivers.
        </p>
      ) : (
        <UplotChart options={options} data={data} />
      )}
    </div>
  );
}
