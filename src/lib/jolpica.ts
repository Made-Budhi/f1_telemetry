import type {
  JConstructorStanding,
  JDriverStanding,
  JRace,
} from "./types";

const BASE = "https://api.jolpi.ca/ergast/f1";

interface ScheduleResponse {
  MRData: { RaceTable?: { Races?: JRace[] } };
}

interface StandingsResponse {
  MRData: {
    StandingsTable?: {
      StandingsLists?: {
        DriverStandings?: JDriverStanding[];
        ConstructorStandings?: JConstructorStanding[];
      }[];
    };
  };
}

async function jolpica<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}/${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getSchedule(year: string | number): Promise<JRace[]> {
  const j = await jolpica<ScheduleResponse>(`${year}.json?limit=100`, 21600);
  return j?.MRData.RaceTable?.Races ?? [];
}

export async function getDriverStandings(
  year: string | number,
): Promise<JDriverStanding[]> {
  const j = await jolpica<StandingsResponse>(
    `${year}/driverstandings.json?limit=100`,
    3600,
  );
  return j?.MRData.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [];
}

export async function getConstructorStandings(
  year: string | number,
): Promise<JConstructorStanding[]> {
  const j = await jolpica<StandingsResponse>(
    `${year}/constructorstandings.json?limit=100`,
    3600,
  );
  return (
    j?.MRData.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []
  );
}

export async function getRaceResults(
  year: string | number,
  round: string | number,
): Promise<JRace | null> {
  const j = await jolpica<ScheduleResponse>(
    `${year}/${round}/results.json?limit=50`,
    3600,
  );
  return j?.MRData.RaceTable?.Races?.[0] ?? null;
}

export async function getQualifying(
  year: string | number,
  round: string | number,
): Promise<JRace | null> {
  const j = await jolpica<ScheduleResponse>(
    `${year}/${round}/qualifying.json?limit=50`,
    3600,
  );
  return j?.MRData.RaceTable?.Races?.[0] ?? null;
}

export async function getLastRaceResults(): Promise<JRace | null> {
  const j = await jolpica<ScheduleResponse>(
    `current/last/results.json?limit=50`,
    1800,
  );
  return j?.MRData.RaceTable?.Races?.[0] ?? null;
}
