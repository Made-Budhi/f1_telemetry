// ---- OpenF1 (https://api.openf1.org/v1) ----

export interface Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_name: string;
  circuit_short_name: string;
  date_start: string;
  year: number;
}

export interface Session {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  location: string;
  year: number;
}

export interface Driver {
  driver_number: number;
  session_key: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string | null;
  country_code: string | null;
  headshot_url: string | null;
}

export interface Lap {
  session_key: number;
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  is_pit_out_lap: boolean;
  st_speed: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  date_start: string | null;
}

export interface Stint {
  session_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface PositionEntry {
  session_key: number;
  driver_number: number;
  position: number;
  date: string;
}

export interface LocationSample {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

export interface CarSample {
  date: string;
  driver_number: number;
  speed: number;
  n_gear: number;
  throttle: number;
  brake: number;
  rpm: number;
  drs: number;
}

// ---- Jolpica-F1 (Ergast-compatible) ----

export interface JDriver {
  driverId: string;
  code?: string;
  permanentNumber?: string;
  givenName: string;
  familyName: string;
  nationality?: string;
}

export interface JConstructor {
  constructorId: string;
  name: string;
  nationality?: string;
}

export interface JResult {
  position: string;
  number: string;
  grid: string;
  laps: string;
  status: string;
  points: string;
  Driver: JDriver;
  Constructor: JConstructor;
  Time?: { time: string };
  FastestLap?: { rank: string; lap: string; Time?: { time: string } };
}

export interface JQualiResult {
  position: string;
  Driver: JDriver;
  Constructor: JConstructor;
  Q1?: string;
  Q2?: string;
  Q3?: string;
}

export interface JRace {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: { locality: string; country: string };
  };
  Sprint?: { date: string; time?: string };
  Results?: JResult[];
  QualifyingResults?: JQualiResult[];
}

export interface JDriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: JDriver;
  Constructors: JConstructor[];
}

export interface JConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: JConstructor;
}
