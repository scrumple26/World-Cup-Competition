"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWcData } from "@/lib/useWcData";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isPlayed } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";

// ---- constants ----

const CT = "America/Chicago";
const LIVE_STATUSES  = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);
const DONE_STATUSES  = new Set(["FT", "AET", "PEN"]);
const POLL_MS        = 60_000;          // poll every 60 s
const PRE_WINDOW_MS  = 5 * 60_000;     // start 5 min before kickoff
const POST_WINDOW_MS = 5 * 60_000;     // stop 5 min after approx. finish
const MATCH_MAX_MS   = 125 * 60_000;   // generous max match length (ET + extra)

// ---- helpers ----

function ctDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT, weekday: "short", month: "short", day: "numeric",
  }).format(new Date(iso));
}

function ctTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function normalizeRound(r: string): string {
  if (r.startsWith("Group Stage")) return "Group Stage";
  if (r === "3rd Place Final") return "3rd Place";
  return r;
}

/** Returns true while a match is within the live-poll window. */
function inPollWindow(m: WcMatch, now: number): boolean {
  const kickoff = new Date(m.kickoff).getTime();
  if (LIVE_STATUSES.has(m.status)) return true;
  if (m.status === "NS" && now >= kickoff - PRE_WINDOW_MS && now < kickoff + 10_000) return true;
  if (DONE_STATUSES.has(m.status)) {
    const approxEnd = kickoff + MATCH_MAX_MS;
    return now <= approxEnd + POST_WINDOW_MS;
  }
  return false;
}

// ---- filter type ----

type Filter = "all" | "group" | "knockout";
const FILTERS: [Filter, string][] = [["all", "All"], ["group", "Group Stage"], ["knockout", "Knockout"]];

// ---- main component ----

export function ScheduleClient() {
  const { data: wc, loading } = useWcData();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  // Live overrides keyed by fixture ID
  const [live, setLive] = useState<Record<number, WcMatch>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideScores = user?.hideScores ?? false;

  // Polling effect
  useEffect(() => {
    if (!wc) return;

    async function poll() {
      const now = Date.now();
      const ids = wc!.fixtures.filter((m) => inPollWindow(m, now)).map((m) => m.id);
      if (ids.length === 0) return;
      try {
        const res = await fetch(`/api/wc/live?ids=${ids.join(",")}`);
        if (!res.ok) return;
        const data = await res.json() as { matches: WcMatch[] };
        setLive((prev) => {
          const next = { ...prev };
          for (const m of data.matches) next[m.id] = m;
          return next;
        });
      } catch { /* silent — stale data is fine */ }
    }

    // Poll immediately if any match is active right now
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [wc]);

  const byDate = useMemo(() => {
    if (!wc) return [];
    const fixtures = [...wc.fixtures]
      .filter((m) => {
        if (filter === "group") return m.round.startsWith("Group Stage");
        if (filter === "knockout") return !m.round.startsWith("Group Stage");
        return true;
      })
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

    const map = new Map<string, WcMatch[]>();
    for (const m of fixtures) {
      const d = ctDate(m.kickoff);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(m);
    }
    return [...map.entries()];
  }, [wc, filter]);

  if (loading || !wc) return <p className="text-[var(--muted)]">Loading schedule…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <div className="flex items-center gap-3">
          {hideScores && (
            <span className="text-xs text-amber-400/80">Scores hidden</span>
          )}
          <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
            {FILTERS.map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  filter === val
                    ? "bg-[var(--accent)] text-[#06210f]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {byDate.length === 0 && (
        <p className="text-[var(--muted)]">No matches. Use Admin → Sync now to pull data.</p>
      )}

      {byDate.map(([date, matches]) => (
        <section key={date}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            {date}&nbsp;&nbsp;·&nbsp;&nbsp;Central Time
          </h2>
          <div className="card divide-y divide-[var(--border)] overflow-hidden">
            {matches.map((m) => (
              <MatchRow
                key={m.id}
                match={live[m.id] ?? m}
                hideScores={hideScores}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- match row ----

function MatchRow({ match: m, hideScores }: { match: WcMatch; hideScores: boolean }) {
  const played = isPlayed(m);
  const isLive = LIVE_STATUSES.has(m.status);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-sm font-medium">{m.homeTeamName}</span>
        <Flag src={m.homeLogo} alt={m.homeTeamName} />
      </div>

      <div className="flex w-28 flex-col items-center gap-0.5">
        <ScoreOrTime match={m} played={played} live={isLive} hideScores={hideScores} />
        <span className="text-[10px] text-[var(--muted)]">{normalizeRound(m.round)}</span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Flag src={m.awayLogo} alt={m.awayTeamName} />
        <span className="truncate text-sm font-medium">{m.awayTeamName}</span>
      </div>
    </div>
  );
}

function Flag({ src, alt }: { src: string; alt: string }) {
  if (!src) return <span className="h-6 w-9 flex-shrink-0 rounded-sm bg-[var(--border)]" />;
  return (
    <img src={src} alt={alt} width={36} height={24}
      className="h-6 w-9 flex-shrink-0 rounded-sm object-contain" loading="lazy" />
  );
}

function ScoreOrTime({
  match: m, played, live, hideScores,
}: {
  match: WcMatch; played: boolean; live: boolean; hideScores: boolean;
}) {
  if (live) {
    if (hideScores) {
      return (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-sm font-semibold text-green-400">LIVE</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span className="font-mono text-sm font-bold text-green-400">
          {m.goals.home !== null ? `${m.goals.home} – ${m.goals.away}` : "LIVE"}
        </span>
      </span>
    );
  }

  if (played) {
    if (hideScores) {
      const tag = m.status === "AET" ? "AET" : m.status === "PEN" ? "PEN" : "FT";
      return <span className="text-xs font-semibold text-[var(--muted)]">{tag}</span>;
    }
    const tag = m.status === "AET" ? "AET" : m.status === "PEN" ? "PEN" : null;
    return (
      <span className="flex items-baseline gap-1.5 font-mono text-base font-bold">
        {m.goals.home}&nbsp;–&nbsp;{m.goals.away}
        {tag && <span className="text-[9px] font-semibold uppercase text-[var(--muted)]">{tag}</span>}
      </span>
    );
  }

  if (m.status === "PST") return <span className="text-xs text-[var(--muted)]">Postponed</span>;
  if (m.status === "CANC") return <span className="text-xs text-[var(--muted)]">Cancelled</span>;

  return <span className="text-sm tabular-nums">{ctTime(m.kickoff)}</span>;
}
