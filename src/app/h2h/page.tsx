import Link from "next/link";
import {
  getConstructorStandings,
  getDriverStandings,
  getSeasonQualifying,
  getSeasonResults,
} from "@/lib/jolpica";
import { constructorColor } from "@/lib/format";

const CURRENT_YEAR = 2026;
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];

/** "1:19.123" or "59.998" -> seconds */
function parseQ(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

interface Entry {
  qPos?: number;
  q1?: number | null;
  q2?: number | null;
  q3?: number | null;
  rPos?: number;
  finished?: boolean;
}

interface Team {
  name: string;
  rounds: Map<string, Map<string, Entry>>;
  names: Map<string, string>;
  count: Map<string, number>;
}

export default async function H2hPage({
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

  const [quali, results, dStandings, cStandings] = await Promise.all([
    getSeasonQualifying(year),
    getSeasonResults(year),
    getDriverStandings(year),
    getConstructorStandings(year),
  ]);

  const teams = new Map<string, Team>();
  const touch = (
    cid: string,
    cname: string,
    round: string,
    did: string,
    dname: string,
  ): Entry => {
    let t = teams.get(cid);
    if (!t) {
      t = { name: cname, rounds: new Map(), names: new Map(), count: new Map() };
      teams.set(cid, t);
    }
    t.names.set(did, dname);
    t.count.set(did, (t.count.get(did) ?? 0) + 1);
    let rd = t.rounds.get(round);
    if (!rd) {
      rd = new Map();
      t.rounds.set(round, rd);
    }
    let e = rd.get(did);
    if (!e) {
      e = {};
      rd.set(did, e);
    }
    return e;
  };

  for (const race of quali) {
    for (const q of race.QualifyingResults ?? []) {
      const e = touch(
        q.Constructor.constructorId,
        q.Constructor.name,
        race.round,
        q.Driver.driverId,
        `${q.Driver.givenName} ${q.Driver.familyName}`,
      );
      e.qPos = Number(q.position);
      e.q1 = parseQ(q.Q1);
      e.q2 = parseQ(q.Q2);
      e.q3 = parseQ(q.Q3);
    }
  }
  for (const race of results) {
    for (const r of race.Results ?? []) {
      const e = touch(
        r.Constructor.constructorId,
        r.Constructor.name,
        race.round,
        r.Driver.driverId,
        `${r.Driver.givenName} ${r.Driver.familyName}`,
      );
      e.rPos = Number(r.position);
      e.finished = /Finished|\+\d+ Lap/.test(r.status);
    }
  }

  const points = new Map(dStandings.map((s) => [s.Driver.driverId, s.points]));
  const orderIdx = new Map(
    cStandings.map((s, i) => [s.Constructor.constructorId, i]),
  );

  const duels = [...teams.entries()]
    .map(([cid, t]) => {
      const pair = [...t.count.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map((e) => e[0]);
      if (pair.length < 2) return null;
      const [ida, idb] = pair;
      let qa = 0;
      let qb = 0;
      let ra = 0;
      let rb = 0;
      const gaps: number[] = [];
      for (const rd of t.rounds.values()) {
        const ea = rd.get(ida);
        const eb = rd.get(idb);
        if (!ea || !eb) continue;
        if (ea.qPos != null && eb.qPos != null) {
          if (ea.qPos < eb.qPos) qa++;
          else qb++;
          // gap from the deepest quali segment both drivers set a time in
          const common =
            ea.q3 != null && eb.q3 != null
              ? ea.q3 - eb.q3
              : ea.q2 != null && eb.q2 != null
                ? ea.q2 - eb.q2
                : ea.q1 != null && eb.q1 != null
                  ? ea.q1 - eb.q1
                  : null;
          if (common != null && Math.abs(common) < 5) gaps.push(common);
        }
        if (ea.finished && eb.finished && ea.rPos != null && eb.rPos != null) {
          if (ea.rPos < eb.rPos) ra++;
          else rb++;
        }
      }
      const med = median(gaps);
      return {
        cid,
        name: t.name,
        a: { id: ida, name: t.names.get(ida) ?? ida, q: qa, r: ra },
        b: { id: idb, name: t.names.get(idb) ?? idb, q: qb, r: rb },
        med,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d != null)
    .sort(
      (a, b) => (orderIdx.get(a.cid) ?? 99) - (orderIdx.get(b.cid) ?? 99),
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {year} Teammate Head-to-Head
          </h1>
          <p className="text-sm text-muted">
            Qualifying &amp; race duels per team. Race duels count only events
            where both cars were classified finishers.
          </p>
        </div>
        <nav className="flex gap-1 text-sm">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={`/h2h?year=${y}`}
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

      {duels.length === 0 ? (
        <p className="text-sm text-muted">No head-to-head data for {year}.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {duels.map((duel) => {
            const color = constructorColor(duel.cid);
            const fasterSide =
              duel.med == null || duel.med === 0
                ? null
                : duel.med > 0
                  ? "b"
                  : "a";
            return (
              <div
                key={duel.cid}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-1.5 rounded-sm"
                    style={{ background: color }}
                  />
                  <h2 className="font-medium">{duel.name}</h2>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{duel.a.name}</p>
                    <p className="font-mono text-xs text-muted">
                      {points.get(duel.a.id) ?? "0"} pts
                    </p>
                  </div>
                  <span className="text-xs text-muted">vs</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{duel.b.name}</p>
                    <p className="font-mono text-xs text-muted">
                      {points.get(duel.b.id) ?? "0"} pts
                    </p>
                  </div>
                </div>

                <DuelBar
                  label="Qualifying"
                  a={duel.a.q}
                  b={duel.b.q}
                  color={color}
                />
                <DuelBar label="Race" a={duel.a.r} b={duel.b.r} color={color} />

                <p className="mt-3 text-xs text-muted">
                  {duel.med == null
                    ? "No comparable qualifying times."
                    : fasterSide == null
                      ? "Dead even on median qualifying pace."
                      : `Median quali gap: ${Math.abs(duel.med).toFixed(3)}s — ${
                          fasterSide === "a" ? duel.a.name : duel.b.name
                        } faster`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DuelBar({
  label,
  a,
  b,
  color,
}: {
  label: string;
  a: number;
  b: number;
  color: string;
}) {
  const total = a + b;
  const pct = total ? (a / total) * 100 : 50;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono font-semibold">{a}</span>
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold">{b}</span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-surface-2">
        <div
          style={{ width: `${pct}%`, background: color }}
          className="border-r border-background"
        />
        <div className="flex-1" style={{ background: `${color}55` }} />
      </div>
    </div>
  );
}
