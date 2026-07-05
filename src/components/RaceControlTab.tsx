"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/useApi";
import { teamColor } from "@/lib/format";
import type { Driver, RaceControlMsg, Session } from "@/lib/types";

const FLAG_STYLE: Record<string, { bg: string; text: string }> = {
  GREEN: { bg: "#22c55e", text: "#052e16" },
  CLEAR: { bg: "#22c55e", text: "#052e16" },
  YELLOW: { bg: "#eab308", text: "#1c1400" },
  "DOUBLE YELLOW": { bg: "#eab308", text: "#1c1400" },
  RED: { bg: "#ef4444", text: "#ffffff" },
  BLUE: { bg: "#3b82f6", text: "#ffffff" },
  CHEQUERED: { bg: "#e5e7eb", text: "#111111" },
  "BLACK AND WHITE": { bg: "#e5e7eb", text: "#111111" },
};

function fmtOffset(ms: number): string {
  const neg = ms < 0;
  const s = Math.abs(Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return (neg ? "-" : "") + body;
}

export default function RaceControlTab({
  session,
  drivers,
}: {
  session: Session;
  drivers: Driver[];
}) {
  const rc = useApi<RaceControlMsg[]>(
    `/api/openf1/race_control?session_key=${session.session_key}`,
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const t0 = useMemo(() => Date.parse(session.date_start), [session]);
  const byNum = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  const categories = useMemo(
    () => [...new Set((rc.data ?? []).map((r) => r.category ?? "Other"))],
    [rc.data],
  );

  const rows = useMemo(
    () =>
      [...(rc.data ?? [])]
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .filter((r) => !hidden.has(r.category ?? "Other")),
    [rc.data, hidden],
  );

  const toggle = (c: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  if (rc.loading) {
    return (
      <p className="animate-pulse py-8 text-center text-sm text-muted">
        Loading race control messages…
      </p>
    );
  }
  if (rc.error) {
    return (
      <p className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-300">
        {rc.error}
      </p>
    );
  }
  if (!rc.data?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        No race control messages for this session.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => toggle(c)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
              hidden.has(c)
                ? "border-line text-muted"
                : "border-accent/60 bg-accent/10 text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">
          {rows.length} messages
        </span>
      </div>
      <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
        {rows.map((r, i) => {
          const flag = r.flag?.toUpperCase() ?? null;
          const style = flag ? FLAG_STYLE[flag] : undefined;
          const isSC =
            r.category === "SafetyCar" ||
            /SAFETY CAR|VIRTUAL/i.test(r.message);
          const d =
            r.driver_number != null ? byNum.get(r.driver_number) : undefined;
          return (
            <li key={i} className="flex items-start gap-3 px-4 py-2 text-sm">
              <span className="w-16 shrink-0 pt-0.5 text-right font-mono text-xs text-muted">
                {fmtOffset(Date.parse(r.date) - t0)}
              </span>
              <span className="w-10 shrink-0 pt-0.5 font-mono text-xs text-muted">
                {r.lap_number != null ? `L${r.lap_number}` : ""}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                {style && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: style.bg, color: style.text }}
                  >
                    {flag}
                  </span>
                )}
                {!style && isSC && (
                  <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                    {/VIRTUAL/i.test(r.message) ? "VSC" : "SC"}
                  </span>
                )}
                {d && (
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: teamColor(d.team_colour) }}
                  >
                    {d.name_acronym}
                  </span>
                )}
                <span className="min-w-0 break-words text-[13px]">
                  {r.message}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
