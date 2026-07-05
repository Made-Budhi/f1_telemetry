import Link from "next/link";
import { notFound } from "next/navigation";
import { getQualifying, getRaceResults } from "@/lib/jolpica";
import { constructorColor, fmtDate } from "@/lib/format";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ year: string; round: string }>;
}) {
  const { year, round } = await params;
  const [race, quali] = await Promise.all([
    getRaceResults(year, round),
    getQualifying(year, round),
  ]);

  if (!race) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/calendar?year=${year}`}
          className="text-xs text-muted hover:text-foreground"
        >
          ← {year} calendar
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {race.raceName}{" "}
          <span className="text-sm font-normal text-muted">
            Round {race.round}
          </span>
        </h1>
        <p className="text-sm text-muted">
          {race.Circuit.circuitName} — {race.Circuit.Location.locality},{" "}
          {race.Circuit.Location.country} · {fmtDate(`${race.date}T00:00:00Z`)}
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
          Race result
        </h2>
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2 font-medium">Pos</th>
              <th className="px-2 py-2 font-medium">No</th>
              <th className="px-2 py-2 font-medium">Driver</th>
              <th className="px-2 py-2 font-medium">Team</th>
              <th className="px-2 py-2 text-right font-medium">Grid</th>
              <th className="px-2 py-2 text-right font-medium">Laps</th>
              <th className="px-2 py-2 text-right font-medium">Time / Status</th>
              <th className="px-4 py-2 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {(race.Results ?? []).map((r) => (
              <tr key={r.position} className="border-t border-line">
                <td className="px-4 py-2 font-mono text-xs">{r.position}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted">
                  {r.number}
                </td>
                <td className="px-2 py-2">
                  <span
                    className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
                    style={{
                      background: constructorColor(r.Constructor.constructorId),
                    }}
                  />
                  <span className="font-medium">
                    {r.Driver.givenName} {r.Driver.familyName}
                  </span>
                  {r.FastestLap?.rank === "1" && (
                    <span
                      className="ml-2 rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-400"
                      title={`Fastest lap: ${r.FastestLap.Time?.time ?? ""}`}
                    >
                      FL
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-muted">{r.Constructor.name}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {r.grid === "0" ? "PL" : r.grid}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {r.laps}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {r.Time?.time ?? r.status}
                </td>
                <td className="px-4 py-2 text-right font-mono">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {quali?.QualifyingResults?.length ? (
        <section className="overflow-x-auto rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
            Qualifying
          </h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-medium">Pos</th>
                <th className="px-2 py-2 font-medium">Driver</th>
                <th className="px-2 py-2 font-medium">Team</th>
                <th className="px-2 py-2 text-right font-medium">Q1</th>
                <th className="px-2 py-2 text-right font-medium">Q2</th>
                <th className="px-4 py-2 text-right font-medium">Q3</th>
              </tr>
            </thead>
            <tbody>
              {quali.QualifyingResults.map((q) => (
                <tr key={q.position} className="border-t border-line">
                  <td className="px-4 py-2 font-mono text-xs">{q.position}</td>
                  <td className="px-2 py-2">
                    <span
                      className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
                      style={{
                        background: constructorColor(
                          q.Constructor.constructorId,
                        ),
                      }}
                    />
                    <span className="font-medium">
                      {q.Driver.givenName} {q.Driver.familyName}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-muted">{q.Constructor.name}</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">
                    {q.Q1 ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs">
                    {q.Q2 ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs">
                    {q.Q3 ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
