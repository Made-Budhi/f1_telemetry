"use client";

import { useEffect, useMemo, useState } from "react";
import SessionPicker from "@/components/SessionPicker";
import DriverSelect from "@/components/DriverSelect";
import TimingTable from "@/components/TimingTable";
import LapChart from "@/components/LapChart";
import TelemetryTab from "@/components/TelemetryTab";
import StintChart from "@/components/StintChart";
import ReplayTab from "@/components/ReplayTab";
import GhostTab from "@/components/GhostTab";
import StrategyTab from "@/components/StrategyTab";
import RaceControlTab from "@/components/RaceControlTab";
import WeatherTab from "@/components/WeatherTab";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import type {
  Driver,
  Lap,
  PositionEntry,
  Session,
  Stint,
} from "@/lib/types";

const TABS = [
  ["timing", "Timing"],
  ["replay", "Replay"],
  ["ghost", "Ghost Race"],
  ["laps", "Lap Times"],
  ["telemetry", "Telemetry"],
  ["stints", "Stints"],
  ["strategy", "Strategy"],
  ["control", "Race Control"],
  ["weather", "Weather"],
] as const;
type TabKey = (typeof TABS)[number][0];

export default function TelemetryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [tab, setTab] = useState<TabKey>("timing");

  const sk = session?.session_key;
  const drivers = useApi<Driver[]>(
    sk ? `/api/openf1/drivers?session_key=${sk}` : null,
  );
  const laps = useApi<Lap[]>(sk ? `/api/openf1/laps?session_key=${sk}` : null);
  const stints = useApi<Stint[]>(
    sk ? `/api/openf1/stints?session_key=${sk}` : null,
  );
  const positions = useApi<PositionEntry[]>(
    sk ? `/api/openf1/position?session_key=${sk}` : null,
  );

  const bestByDriver = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of laps.data ?? []) {
      if (l.lap_duration == null) continue;
      const cur = m.get(l.driver_number);
      if (cur == null || l.lap_duration < cur) {
        m.set(l.driver_number, l.lap_duration);
      }
    }
    return m;
  }, [laps.data]);

  // default: pre-select the session's two fastest drivers
  useEffect(() => {
    if (selected.length || !drivers.data?.length || bestByDriver.size === 0) {
      return;
    }
    const fastest = [...bestByDriver.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map((e) => e[0]);
    if (fastest.length) setSelected(fastest);
  }, [drivers.data, bestByDriver, selected.length]);

  const selectedDrivers = useMemo(
    () => (drivers.data ?? []).filter((d) => selected.includes(d.driver_number)),
    [drivers.data, selected],
  );

  const loading = !!sk && (drivers.loading || laps.loading);
  const error = drivers.error ?? laps.error;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Telemetry explorer
        </h1>
        <p className="text-sm text-muted">
          Timing and car telemetry for every session since 2023, via OpenF1.
        </p>
      </div>

      <SessionPicker
        onSession={(s) => {
          setSession(s);
          setSelected([]);
        }}
      />

      {!session && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Pick a year, Grand Prix and session above to start.
        </div>
      )}

      {session && (
        <>
          <h2 className="font-medium">
            {session.session_name} — {session.circuit_short_name},{" "}
            {session.country_name}
            <span className="ml-2 text-sm font-normal text-muted">
              {fmtDate(session.date_start)}
            </span>
          </h2>

          {loading && (
            <p className="animate-pulse text-sm text-muted">
              Loading session data…
            </p>
          )}
          {error && (
            <p className="text-sm text-red-400">
              Failed to load session data: {error}
            </p>
          )}

          {drivers.data && laps.data && !loading && (
            <>
              <DriverSelect
                drivers={drivers.data}
                selected={selected}
                onChange={setSelected}
                max={4}
              />

              <div className="flex gap-1 overflow-x-auto border-b border-line whitespace-nowrap">
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                      tab === key
                        ? "border-accent text-foreground"
                        : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {laps.data.length === 0 && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
                  No data published for this session yet. Free historical data
                  appears roughly 30–60 minutes after a session ends
                  {Date.parse(session.date_end) > Date.now()
                    ? " — this one hasn't finished yet."
                    : "."}
                </p>
              )}

              {tab === "timing" && (
                <TimingTable
                  drivers={drivers.data}
                  laps={laps.data}
                  positions={positions.data ?? []}
                  sessionType={session.session_type}
                />
              )}
              {tab === "replay" && (
                <ReplayTab
                  key={session.session_key}
                  session={session}
                  drivers={drivers.data}
                  laps={laps.data}
                  positions={positions.data ?? []}
                />
              )}
              {tab === "ghost" &&
                (selectedDrivers.length ? (
                  <GhostTab
                    key={session.session_key}
                    session={session}
                    drivers={selectedDrivers}
                    laps={laps.data}
                  />
                ) : (
                  <Hint text="Select at least one driver above." />
                ))}
              {tab === "laps" &&
                (selectedDrivers.length ? (
                  <LapChart
                    drivers={selectedDrivers}
                    laps={laps.data}
                    sessionType={session.session_type}
                  />
                ) : (
                  <Hint text="Select at least one driver above." />
                ))}
              {tab === "telemetry" &&
                (selectedDrivers.length ? (
                  <TelemetryTab
                    session={session}
                    drivers={selectedDrivers}
                    laps={laps.data}
                  />
                ) : (
                  <Hint text="Select at least one driver above." />
                ))}
              {tab === "stints" && (
                <StintChart
                  drivers={drivers.data}
                  stints={stints.data ?? []}
                  positions={positions.data ?? []}
                />
              )}
              {tab === "strategy" && (
                <StrategyTab
                  session={session}
                  drivers={drivers.data}
                  laps={laps.data}
                  stints={stints.data ?? []}
                  positions={positions.data ?? []}
                />
              )}
              {tab === "control" && (
                <RaceControlTab session={session} drivers={drivers.data} />
              )}
              {tab === "weather" && <WeatherTab session={session} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}
