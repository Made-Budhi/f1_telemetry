"use client";

import { useState } from "react";
import { useApi } from "@/lib/useApi";
import type { Meeting, Session } from "@/lib/types";

const YEARS = [2026, 2025, 2024, 2023];

const selectCls =
  "rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-40";

export default function SessionPicker({
  onSession,
}: {
  onSession: (s: Session | null) => void;
}) {
  const [year, setYear] = useState(2026);
  const [meetingKey, setMeetingKey] = useState<number | "">("");
  const [sessionKey, setSessionKey] = useState<number | "">("");

  const meetings = useApi<Meeting[]>(`/api/openf1/meetings?year=${year}`);
  const sessions = useApi<Session[]>(
    meetingKey ? `/api/openf1/sessions?meeting_key=${meetingKey}` : null,
  );

  const sortedMeetings = [...(meetings.data ?? [])].sort(
    (a, b) => Date.parse(b.date_start) - Date.parse(a.date_start),
  );
  const sortedSessions = [...(sessions.data ?? [])].sort(
    (a, b) => Date.parse(a.date_start) - Date.parse(b.date_start),
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Year
        <select
          className={selectCls}
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setMeetingKey("");
            setSessionKey("");
            onSession(null);
          }}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Grand Prix
        <select
          className={selectCls}
          value={meetingKey}
          disabled={meetings.loading || !sortedMeetings.length}
          onChange={(e) => {
            setMeetingKey(e.target.value ? Number(e.target.value) : "");
            setSessionKey("");
            onSession(null);
          }}
        >
          <option value="">
            {meetings.loading ? "Loading…" : "Select a Grand Prix"}
          </option>
          {sortedMeetings.map((m) => (
            <option key={m.meeting_key} value={m.meeting_key}>
              {m.meeting_name} — {m.country_name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Session
        <select
          className={selectCls}
          value={sessionKey}
          disabled={!meetingKey || sessions.loading}
          onChange={(e) => {
            const key = e.target.value ? Number(e.target.value) : "";
            setSessionKey(key);
            onSession(
              key === ""
                ? null
                : (sessions.data ?? []).find((s) => s.session_key === key) ??
                    null,
            );
          }}
        >
          <option value="">
            {sessions.loading ? "Loading…" : "Select a session"}
          </option>
          {sortedSessions.map((s) => (
            <option key={s.session_key} value={s.session_key}>
              {s.session_name}
            </option>
          ))}
        </select>
      </label>

      {meetings.error && (
        <p className="text-xs text-red-400">
          Could not load meetings: {meetings.error}
        </p>
      )}
    </div>
  );
}
