import Link from "next/link";
import {
  getConstructorStandings,
  getDriverStandings,
  getLastRaceResults,
  getSchedule,
} from "@/lib/jolpica";
import { constructorColor, fmtDate } from "@/lib/format";
import type { JRace } from "@/lib/types";

export const revalidate = 1800;

function raceTs(r: JRace): number {
  return Date.parse(`${r.date}T${r.time ?? "12:00:00Z"}`);
}

export default async function Home() {
  const [schedule, driverStandings, constructorStandings, lastRace] =
    await Promise.all([
      getSchedule("current"),
      getDriverStandings("current"),
      getConstructorStandings("current"),
      getLastRaceResults(),
    ]);

  const now = Date.now();
  // a race weekend stays "next" until ~3h after lights out
  const next = schedule.find((r) => raceTs(r) + 3 * 3600_000 > now) ?? null;
  const daysTo = next
    ? Math.max(0, Math.ceil((raceTs(next) - now) / 86_400_000))
    : null;
  const badge =
    daysTo == null
      ? ""
      : raceTs(next!) - now < 86_400_000
        ? "Today"
        : daysTo === 1
          ? "Tomorrow"
          : `in ${daysTo} days`;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-muted">
            Next race
          </p>
          {next ? (
            <div className="mt-2">
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {next.raceName}
                </h1>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                  {badge}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Round {next.round} of {schedule.length} ·{" "}
                {next.Circuit.circuitName} — {next.Circuit.Location.locality},{" "}
                {next.Circuit.Location.country}
              </p>
              <p className="mt-3 font-mono text-sm">
                {fmtDate(`${next.date}T${next.time ?? "00:00:00Z"}`, !!next.time)}
              </p>
              {next.Sprint && (
                <p className="mt-1 text-xs text-amber-400">Sprint weekend</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Season complete — see the{" "}
              <Link href="/calendar" className="text-accent hover:underline">
                calendar
              </Link>
              .
            </p>
          )}
          <Link
            href="/telemetry"
            className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Open telemetry explorer →
          </Link>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-wider text-muted">
            Last race
          </p>
          {lastRace?.Results?.length ? (
            <div className="mt-2">
              <h2 className="font-medium">{lastRace.raceName}</h2>
              <p className="text-xs text-muted">{fmtDate(lastRace.date)}</p>
              <ol className="mt-3 space-y-2">
                {lastRace.Results.slice(0, 3).map((r) => (
                  <li key={r.position} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-bold ${
                        r.position === "1"
                          ? "bg-amber-400 text-black"
                          : "bg-surface-2"
                      }`}
                    >
                      {r.position}
                    </span>
                    <span className="text-sm font-medium">
                      {r.Driver.givenName} {r.Driver.familyName}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {r.Constructor.name}
                    </span>
                  </li>
                ))}
              </ol>
              <Link
                href={`/results/${lastRace.season}/${lastRace.round}`}
                className="mt-4 inline-block text-sm text-accent hover:underline"
              >
                Full results →
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No results yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StandingsCard
          title="Driver standings"
          href="/standings"
          rows={driverStandings.slice(0, 8).map((s) => ({
            key: s.Driver.driverId,
            pos: s.position,
            name: `${s.Driver.givenName} ${s.Driver.familyName}`,
            sub: s.Constructors[0]?.name ?? "",
            color: constructorColor(s.Constructors[0]?.constructorId),
            points: s.points,
          }))}
        />
        <StandingsCard
          title="Constructor standings"
          href="/standings"
          rows={constructorStandings.slice(0, 8).map((s) => ({
            key: s.Constructor.constructorId,
            pos: s.position,
            name: s.Constructor.name,
            sub: "",
            color: constructorColor(s.Constructor.constructorId),
            points: s.points,
          }))}
        />
      </section>
    </div>
  );
}

function StandingsCard({
  title,
  href,
  rows,
}: {
  title: string;
  href: string;
  rows: {
    key: string;
    pos: string;
    name: string;
    sub: string;
    color: string;
    points: string;
  }[];
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted">{title}</p>
        <Link href={href} className="text-xs text-accent hover:underline">
          View all
        </Link>
      </div>
      {rows.length ? (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-right font-mono text-xs text-muted">
                {r.pos}
              </span>
              <span
                className="h-3.5 w-1 rounded-sm"
                style={{ background: r.color }}
              />
              <span className="font-medium">{r.name}</span>
              {r.sub && <span className="text-xs text-muted">{r.sub}</span>}
              <span className="ml-auto font-mono text-sm">{r.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Standings unavailable.</p>
      )}
    </div>
  );
}
