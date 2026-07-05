"use client";

import { useMemo } from "react";
import uPlot from "uplot";
import UplotChart from "./UplotChart";
import { CHART_AXIS, CHART_GRID } from "@/lib/format";
import type { AlignedChannels } from "@/lib/telemetry";
import type { Driver } from "@/lib/types";

interface PanelCfg {
  key: keyof AlignedChannels;
  label: string;
  height: number;
  stepped?: boolean;
  range?: [number, number];
  fmt?: (v: number) => string;
}

const PANELS: PanelCfg[] = [
  { key: "speed", label: "Speed (km/h)", height: 230 },
  { key: "throttle", label: "Throttle (%)", height: 110, range: [0, 105] },
  { key: "brake", label: "Brake", height: 90, range: [0, 105], stepped: true },
  { key: "rpm", label: "RPM", height: 110 },
  { key: "gear", label: "Gear", height: 100, range: [0, 9], stepped: true },
  {
    key: "drs",
    label: "DRS (1 = open)",
    height: 80,
    range: [-0.15, 1.15],
    stepped: true,
  },
];

function baseAxes(showX: boolean, xLabel?: string): uPlot.Axis[] {
  return [
    {
      show: showX,
      stroke: CHART_AXIS,
      grid: { stroke: CHART_GRID },
      ticks: { stroke: CHART_GRID },
      label: xLabel,
    },
    {
      stroke: CHART_AXIS,
      grid: { stroke: CHART_GRID },
      ticks: { stroke: CHART_GRID },
      size: 56,
    },
  ];
}

export default function TelemetryPanel({
  xs,
  perDriver,
  drivers,
  colors,
}: {
  xs: number[];
  perDriver: AlignedChannels[];
  drivers: Driver[];
  colors: Map<number, { stroke: string; dash?: number[] }>;
}) {
  const charts = useMemo(() => {
    const steppedPaths = uPlot.paths?.stepped
      ? uPlot.paths.stepped({ align: 1 })
      : undefined;

    const driverSeries = (
      ds: Driver[],
      stepped: boolean,
      fmt?: (v: number) => string,
    ): uPlot.Series[] =>
      ds.map((d) => {
        const c = colors.get(d.driver_number);
        return {
          label: d.name_acronym,
          stroke: c?.stroke ?? "#999",
          dash: c?.dash,
          width: 1.6,
          paths: stepped ? steppedPaths : undefined,
          points: { show: false },
          value: (u: uPlot, v: number) =>
            v == null ? "—" : fmt ? fmt(v) : String(Math.round(v)),
        } as uPlot.Series;
      });

    const distSeries: uPlot.Series = {
      label: "Dist",
      value: (u: uPlot, v: number) => (v == null ? "—" : `${Math.round(v)} m`),
    };

    const list = PANELS.map((p, pi) => {
      const last = pi === PANELS.length - 1;
      return {
        key: p.key as string,
        label: p.label,
        data: [xs, ...perDriver.map((ch) => ch[p.key])] as unknown as uPlot.AlignedData,
        options: {
          height: p.height,
          scales: { x: { time: false }, y: p.range ? { range: p.range } : {} },
          cursor: { sync: { key: "f1tel" }, points: { show: true } },
          axes: baseAxes(last, last ? "Distance (m)" : undefined),
          series: [distSeries, ...driverSeries(drivers, !!p.stepped, p.fmt)],
        } as Omit<uPlot.Options, "width">,
      };
    });

    // delta-time panel: cumulative time gap to the first driver at each
    // point on track — shows exactly where a lap is won and lost
    if (perDriver.length >= 2) {
      const ref = perDriver[0].time;
      const deltas = perDriver.slice(1).map((ch) =>
        ch.time.map((tv, i) => {
          const rv = ref[i];
          return tv != null && rv != null ? tv - rv : null;
        }),
      );
      const fmtDelta = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(3)}s`;
      list.splice(1, 0, {
        key: "delta",
        label: `Δ time vs ${drivers[0].name_acronym} (s) — above 0 = behind`,
        data: [xs, ...deltas] as unknown as uPlot.AlignedData,
        options: {
          height: 130,
          scales: { x: { time: false }, y: {} },
          cursor: { sync: { key: "f1tel" }, points: { show: true } },
          axes: baseAxes(false),
          series: [distSeries, ...driverSeries(drivers.slice(1), false, fmtDelta)],
        } as Omit<uPlot.Options, "width">,
      });
    }

    return list;
  }, [xs, perDriver, drivers, colors]);

  return (
    <div className="space-y-1 rounded-xl border border-line bg-surface p-3">
      {charts.map(({ key, label, data, options }) => (
        <div key={key}>
          <p className="mb-0.5 pl-1 text-[11px] uppercase tracking-wider text-muted">
            {label}
          </p>
          <UplotChart options={options} data={data} />
        </div>
      ))}
    </div>
  );
}
