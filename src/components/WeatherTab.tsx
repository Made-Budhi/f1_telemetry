"use client";

import { useMemo } from "react";
import uPlot from "uplot";
import UplotChart from "./UplotChart";
import { useApi } from "@/lib/useApi";
import { CHART_AXIS, CHART_GRID } from "@/lib/format";
import type { Session, WeatherSample } from "@/lib/types";

function mkOptions(
  height: number,
  series: { label: string; stroke: string; unit: string }[],
  lastAxis: boolean,
): Omit<uPlot.Options, "width"> {
  return {
    height,
    scales: { x: { time: false } },
    cursor: { sync: { key: "f1wx" }, points: { show: true } },
    axes: [
      {
        show: lastAxis,
        stroke: CHART_AXIS,
        grid: { stroke: CHART_GRID },
        ticks: { stroke: CHART_GRID },
        label: lastAxis ? "Session time (min)" : undefined,
      },
      {
        stroke: CHART_AXIS,
        grid: { stroke: CHART_GRID },
        ticks: { stroke: CHART_GRID },
        size: 52,
      },
    ],
    series: [
      {
        label: "t",
        value: (u: uPlot, v: number) =>
          v == null ? "—" : `${Math.round(v)} min`,
      },
      ...series.map(
        (s) =>
          ({
            label: s.label,
            stroke: s.stroke,
            width: 1.6,
            points: { show: false },
            value: (u: uPlot, v: number) =>
              v == null ? "—" : `${v.toFixed(1)}${s.unit}`,
          }) as uPlot.Series,
      ),
    ],
  };
}

export default function WeatherTab({ session }: { session: Session }) {
  const w = useApi<WeatherSample[]>(
    `/api/openf1/weather?session_key=${session.session_key}`,
  );
  const t0 = useMemo(() => Date.parse(session.date_start), [session]);

  const charts = useMemo(() => {
    const rows = [...(w.data ?? [])].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    );
    if (rows.length < 2) return null;
    const xs = rows.map((r) => (Date.parse(r.date) - t0) / 60000);
    const rained = rows.some((r) => r.rainfall > 0);
    return {
      rained,
      temp: {
        data: [
          xs,
          rows.map((r) => r.track_temperature),
          rows.map((r) => r.air_temperature),
        ] as unknown as uPlot.AlignedData,
        options: mkOptions(
          220,
          [
            { label: "Track", stroke: "#f97316", unit: "°C" },
            { label: "Air", stroke: "#38bdf8", unit: "°C" },
          ],
          false,
        ),
      },
      hum: {
        data: [
          xs,
          rows.map((r) => r.humidity),
        ] as unknown as uPlot.AlignedData,
        options: mkOptions(
          140,
          [{ label: "Humidity", stroke: "#34d399", unit: "%" }],
          false,
        ),
      },
      wind: {
        data: [
          xs,
          rows.map((r) => r.wind_speed),
        ] as unknown as uPlot.AlignedData,
        options: mkOptions(
          140,
          [{ label: "Wind", stroke: "#a78bfa", unit: " m/s" }],
          true,
        ),
      },
    };
  }, [w.data, t0]);

  if (w.loading) {
    return (
      <p className="animate-pulse py-8 text-center text-sm text-muted">
        Loading weather data…
      </p>
    );
  }
  if (w.error) {
    return (
      <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
        {w.error}
      </p>
    );
  }
  if (!charts) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No weather data for this session.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p
        className={`rounded-lg border px-4 py-2.5 text-sm ${
          charts.rained
            ? "border-blue-400/40 bg-blue-400/10 text-blue-300"
            : "border-line bg-surface text-muted"
        }`}
      >
        {charts.rained
          ? "🌧 Rain fell during this session."
          : "Dry session — no rainfall recorded."}
      </p>
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-0.5 pl-1 text-[11px] uppercase tracking-wider text-muted">
          Temperature (°C)
        </p>
        <UplotChart options={charts.temp.options} data={charts.temp.data} />
        <p className="mb-0.5 mt-2 pl-1 text-[11px] uppercase tracking-wider text-muted">
          Humidity (%)
        </p>
        <UplotChart options={charts.hum.options} data={charts.hum.data} />
        <p className="mb-0.5 mt-2 pl-1 text-[11px] uppercase tracking-wider text-muted">
          Wind speed (m/s)
        </p>
        <UplotChart options={charts.wind.options} data={charts.wind.data} />
      </div>
    </div>
  );
}
