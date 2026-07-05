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

    return PANELS.map((p, pi) => {
      const last = pi === PANELS.length - 1;
      const data = [
        xs,
        ...perDriver.map((ch) => ch[p.key]),
      ] as unknown as uPlot.AlignedData;

      const options: Omit<uPlot.Options, "width"> = {
        height: p.height,
        scales: {
          x: { time: false },
          y: p.range ? { range: p.range } : {},
        },
        cursor: { sync: { key: "f1tel" }, points: { show: true } },
        axes: [
          {
            show: last,
            stroke: CHART_AXIS,
            grid: { stroke: CHART_GRID },
            ticks: { stroke: CHART_GRID },
            label: last ? "Distance (m)" : undefined,
          },
          {
            stroke: CHART_AXIS,
            grid: { stroke: CHART_GRID },
            ticks: { stroke: CHART_GRID },
            size: 56,
          },
        ],
        series: [
          {
            label: "Dist",
            value: (u: uPlot, v: number) =>
              v == null ? "—" : `${Math.round(v)} m`,
          },
          ...drivers.map((d) => {
            const c = colors.get(d.driver_number);
            return {
              label: d.name_acronym,
              stroke: c?.stroke ?? "#999",
              dash: c?.dash,
              width: 1.6,
              paths: p.stepped ? steppedPaths : undefined,
              points: { show: false },
              value: (u: uPlot, v: number) =>
                v == null ? "—" : p.fmt ? p.fmt(v) : String(Math.round(v)),
            } as uPlot.Series;
          }),
        ],
      };

      return { cfg: p, data, options };
    });
  }, [xs, perDriver, drivers, colors]);

  return (
    <div className="space-y-1 rounded-xl border border-line bg-surface p-3">
      {charts.map(({ cfg, data, options }) => (
        <div key={cfg.key}>
          <p className="mb-0.5 pl-1 text-[11px] uppercase tracking-wider text-muted">
            {cfg.label}
          </p>
          <UplotChart options={options} data={data} />
        </div>
      ))}
    </div>
  );
}
