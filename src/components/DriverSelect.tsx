"use client";

import { teamColor } from "@/lib/format";
import type { Driver } from "@/lib/types";

export default function DriverSelect({
  drivers,
  selected,
  onChange,
  max = 4,
}: {
  drivers: Driver[];
  selected: number[];
  onChange: (nums: number[]) => void;
  max?: number;
}) {
  const sorted = [...drivers].sort(
    (a, b) =>
      a.team_name.localeCompare(b.team_name) ||
      a.driver_number - b.driver_number,
  );

  const toggle = (n: number) => {
    if (selected.includes(n)) {
      onChange(selected.filter((x) => x !== n));
    } else {
      // adding beyond the cap drops the oldest selection
      onChange([...selected, n].slice(-max));
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">
        Compare drivers (max {max}) — used by the Lap Times &amp; Telemetry
        tabs
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((d) => {
          const on = selected.includes(d.driver_number);
          const c = teamColor(d.team_colour);
          return (
            <button
              key={d.driver_number}
              onClick={() => toggle(d.driver_number)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "text-white" : "text-foreground/80 hover:bg-surface-2"
              }`}
              style={
                on
                  ? { background: c, borderColor: c }
                  : { borderColor: `${c}66` }
              }
            >
              <span className="font-mono">{d.driver_number}</span>
              {d.name_acronym}
            </button>
          );
        })}
      </div>
    </div>
  );
}
