"use client";

import { useEffect, useMemo, useState } from "react";
import TelemetryPanel from "./TelemetryPanel";
import {
  align,
  integrate,
  type DriverChannels,
} from "@/lib/telemetry";
import { buildColorMap, fmtLap, teamColor } from "@/lib/format";
import { fetchJson } from "@/lib/useApi";
import type { CarSample, Driver, Lap, Session } from "@/lib/types";

const telemCache = new Map<string, CarSample[]>();

interface LoadedSeries {
  driver: Driver;
  lap: Lap;
  channels: DriverChannels;
}

export default function TelemetryTab({
  session,
  drivers,
  laps,
}: {
  session: Session;
  drivers: Driver[];
  laps: Lap[];
}) {
  const [lapSel, setLapSel] = useState<Record<number, number>>({});
  const [series, setSeries] = useState<{
    sig: string;
    rows: LoadedSeries[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lapsByDriver = useMemo(() => {
    const m = new Map<number, Lap[]>();
    for (const l of laps) {
      if (l.lap_duration == null || l.date_start == null) continue;
      const arr = m.get(l.driver_number);
      if (arr) arr.push(l);
      else m.set(l.driver_number, [l]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.lap_number - b.lap_number);
    return m;
  }, [laps]);

  const chosen = useMemo(() => {
    return drivers
      .map((d) => {
        const dl = lapsByDriver.get(d.driver_number) ?? [];
        if (!dl.length) return null;
        const fastest = dl.reduce((a, b) =>
          (b.lap_duration ?? Infinity) < (a.lap_duration ?? Infinity) ? b : a,
        );
        const wanted = lapSel[d.driver_number];
        const lap = dl.find((l) => l.lap_number === wanted) ?? fastest;
        return { driver: d, lap };
      })
      .filter((x): x is { driver: Driver; lap: Lap } => x != null);
  }, [drivers, lapsByDriver, lapSel]);

  const sig =
    `${session.session_key}|` +
    chosen.map((c) => `${c.driver.driver_number}:${c.lap.lap_number}`).join(",");

  useEffect(() => {
    if (!chosen.length) {
      setSeries(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all(
      chosen.map(async ({ driver, lap }) => {
        const key = `${session.session_key}:${driver.driver_number}:${lap.lap_number}`;
        let samples = telemCache.get(key);
        if (!samples) {
          const start = lap.date_start!;
          const end = new Date(
            Date.parse(start) + ((lap.lap_duration ?? 120) + 0.5) * 1000,
          ).toISOString();
          const url =
            `/api/openf1/car_data?session_key=${session.session_key}` +
            `&driver_number=${driver.driver_number}` +
            `&date>=${encodeURIComponent(start)}&date<${encodeURIComponent(end)}`;
          samples = await fetchJson<CarSample[]>(url);
          telemCache.set(key, samples);
        }
        const channels = integrate(samples, Date.parse(lap.date_start!));
        if (!channels) {
          throw new Error(
            `no car data for ${driver.name_acronym} lap ${lap.lap_number}`,
          );
        }
        return { driver, lap, channels };
      }),
    )
      .then((rows) => {
        if (alive) {
          setSeries({ sig, rows });
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // chosen/session are fully captured by sig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const alignedData = useMemo(() => {
    if (!series?.rows.length) return null;
    return align(series.rows.map((r) => r.channels), 10);
  }, [series]);

  const colors = useMemo(
    () => buildColorMap(series?.rows.map((r) => r.driver) ?? []),
    [series],
  );

  if (!chosen.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No timed laps with telemetry for the selected drivers.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {chosen.map(({ driver, lap }) => {
          const dl = lapsByDriver.get(driver.driver_number) ?? [];
          return (
            <label
              key={driver.driver_number}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="font-mono font-semibold"
                style={{ color: teamColor(driver.team_colour) }}
              >
                {driver.name_acronym}
              </span>
              <select
                value={lap.lap_number}
                onChange={(e) =>
                  setLapSel((s) => ({
                    ...s,
                    [driver.driver_number]: Number(e.target.value),
                  }))
                }
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
              >
                {dl.map((l) => (
                  <option key={l.lap_number} value={l.lap_number}>
                    L{l.lap_number} — {fmtLap(l.lap_duration)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      {loading && (
        <p className="animate-pulse text-sm text-muted">
          Loading car telemetry…
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {alignedData && series && !loading && (
        <>
          <TelemetryPanel
            xs={alignedData.xs}
            perDriver={alignedData.perDriver}
            drivers={series.rows.map((r) => r.driver)}
            colors={colors}
          />
          <p className="text-xs text-muted">
            Distance is integrated from ~3.7 Hz speed samples, so a few metres
            of drift between drivers is normal. Drag to zoom, double-click to
            reset.
          </p>
        </>
      )}
    </div>
  );
}
