import Link from "next/link";
import {
  getConstructorStandings,
  getDriverStandings,
} from "@/lib/jolpica";
import { constructorColor } from "@/lib/format";

const CURRENT_YEAR = 2026;
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

export default async function StandingsPage({
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

  const [drivers, constructors] = await Promise.all([
    getDriverStandings(year),
    getConstructorStandings(year),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          {year} Championship Standings
        </h1>
        <nav className="flex gap-1 text-sm">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={`/standings?year=${y}`}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
            Drivers
          </h2>
          {drivers.length === 0 ? (
            <p className="p-4 text-sm text-muted">No standings yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {drivers.map((s) => (
                  <tr
                    key={s.Driver.driverId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="w-10 px-4 py-2 text-right font-mono text-xs text-muted">
                      {s.position}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
                        style={{
                          background: constructorColor(
                            s.Constructors[0]?.constructorId,
                          ),
                        }}
                      />
                      <span className="font-medium">
                        {s.Driver.givenName} {s.Driver.familyName}
                      </span>
                      <span className="ml-2 text-xs text-muted">
                        {s.Constructors[0]?.name}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-muted">
                      {s.wins !== "0" && `${s.wins}W`}
                    </td>
                    <td className="w-16 px-4 py-2 text-right font-mono">
                      {s.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface self-start">
          <h2 className="border-b border-line px-4 py-3 text-xs uppercase tracking-wider text-muted">
            Constructors
          </h2>
          {constructors.length === 0 ? (
            <p className="p-4 text-sm text-muted">No standings yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {constructors.map((s) => (
                  <tr
                    key={s.Constructor.constructorId}
                    className="border-b border-line last:border-0"
                  >
                    <td className="w-10 px-4 py-2 text-right font-mono text-xs text-muted">
                      {s.position}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className="mr-2 inline-block h-3.5 w-1 rounded-sm align-[-2px]"
                        style={{
                          background: constructorColor(
                            s.Constructor.constructorId,
                          ),
                        }}
                      />
                      <span className="font-medium">{s.Constructor.name}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-muted">
                      {s.wins !== "0" && `${s.wins}W`}
                    </td>
                    <td className="w-16 px-4 py-2 text-right font-mono">
                      {s.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
