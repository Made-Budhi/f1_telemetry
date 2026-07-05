import Link from "next/link";
import { getSchedule } from "@/lib/jolpica";
import { fmtDate } from "@/lib/format";
import type { JRace } from "@/lib/types";

const CURRENT_YEAR = 2026;
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

function raceTs(r: JRace): number {
  return Date.parse(`${r.date}T${r.time ?? "12:00:00Z"}`);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const parsed = Number(yearParam);
  const year =
    Number.isInteger(parsed) && parsed >= 1950 && parsed <= CURRENT_YEAR
      ? parsed
      : CURRENT_YEAR;

  const races = await getSchedule(year);
  const now = Date.now();
  const nextRound = races.find((r) => raceTs(r) + 3 * 3600_000 > now)?.round;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {year} Race Calendar
        </h1>
        <nav className="flex gap-1 text-sm">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={`/calendar?year=${y}`}
              className={`rounded-md px-2.5 py-1 ${
                y === year
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {y}
            </Link>
          ))}
        </nav>
      </div>

      {races.length === 0 ? (
        <p className="text-sm text-muted">No schedule available for {year}.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Rd</th>
                <th className="px-4 py-3 font-medium">Grand Prix</th>
                <th className="px-4 py-3 font-medium">Circuit</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => {
                const past = raceTs(r) + 4 * 3600_000 < now;
                const isNext = r.round === nextRound && year === CURRENT_YEAR;
                return (
                  <tr
                    key={r.round}
                    className={`border-t border-line ${
                      isNext ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">
                      {r.round}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.raceName}</span>
                      {r.Sprint && (
                        <span className="ml-2 rounded border border-amber-400/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                          SPRINT
                        </span>
                      )}
                      {isNext && (
                        <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          NEXT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {r.Circuit.circuitName} · {r.Circuit.Location.country}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {fmtDate(`${r.date}T00:00:00Z`)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {past ? (
                        <Link
                          href={`/results/${r.season}/${r.round}`}
                          className="text-accent hover:underline"
                        >
                          Results
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
