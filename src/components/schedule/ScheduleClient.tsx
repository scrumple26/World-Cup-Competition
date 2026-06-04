"use client";

import { useMemo, useState } from "react";
import { useWcData } from "@/lib/useWcData";
import { isPlayed } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";

// ---- time helpers (Central Time) ----

const CT = "America/Chicago";

function ctDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function ctTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// ---- match helpers ----

const LIVE = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);

function normalizeRound(r: string): string {
  if (r.startsWith("Group Stage")) return "Group Stage";
  if (r === "3rd Place Final") return "3rd Place";
  return r;
}

// ---- filter type ----

type Filter = "all" | "group" | "knockout";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["group", "Group Stage"],
  ["knockout", "Knockout"],
];

// ---- main component ----

export function ScheduleClient() {
  const { data: wc, loading } = useWcData();
  const [filter, setFilter] = useState<Filter>("all");

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

  if (loading || !wc) {
    return <p className="text-[var(--muted)]">Loading schedule…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Schedule</h1>
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

      {byDate.length === 0 && (
        <p className="text-[var(--muted)]">
          No matches found. Use the Admin tab to sync WC data.
        </p>
      )}

      {byDate.map(([date, matches]) => (
        <section key={date}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            {date}&nbsp;&nbsp;·&nbsp;&nbsp;Central Time
          </h2>
          <div className="card divide-y divide-[var(--border)] overflow-hidden">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- match row ----

function MatchRow({ match: m }: { match: WcMatch }) {
  const played = isPlayed(m);
  const live = LIVE.has(m.status);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
      {/* Home */}
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-sm font-medium">{m.homeTeamName}</span>
        <Flag src={m.homeLogo} alt={m.homeTeamName} />
      </div>

      {/* Center */}
      <div className="flex w-28 flex-col items-center gap-0.5">
        <ScoreOrTime match={m} played={played} live={live} />
        <span className="text-[10px] text-[var(--muted)]">{normalizeRound(m.round)}</span>
      </div>

      {/* Away */}
      <div className="flex min-w-0 items-center gap-2">
        <Flag src={m.awayLogo} alt={m.awayTeamName} />
        <span className="truncate text-sm font-medium">{m.awayTeamName}</span>
      </div>
    </div>
  );
}

function Flag({ src, alt }: { src: string; alt: string }) {
  if (!src) {
    return (
      <span className="h-6 w-9 flex-shrink-0 rounded-sm bg-[var(--border)]" />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={36}
      height={24}
      className="h-6 w-9 flex-shrink-0 rounded-sm object-contain"
      loading="lazy"
    />
  );
}

function ScoreOrTime({
  match: m,
  played,
  live,
}: {
  match: WcMatch;
  played: boolean;
  live: boolean;
}) {
  if (played) {
    const tag =
      m.status === "AET" ? "AET" : m.status === "PEN" ? "PEN" : null;
    return (
      <span className="flex items-baseline gap-1.5 font-mono text-base font-bold">
        {m.goals.home}&nbsp;–&nbsp;{m.goals.away}
        {tag && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {tag}
          </span>
        )}
      </span>
    );
  }

  if (live) {
    const hasGoals = m.goals.home !== null;
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span className="font-mono text-sm font-bold text-green-400">
          {hasGoals ? `${m.goals.home} – ${m.goals.away}` : "LIVE"}
        </span>
      </span>
    );
  }

  if (m.status === "PST") {
    return <span className="text-xs text-[var(--muted)]">Postponed</span>;
  }
  if (m.status === "CANC") {
    return <span className="text-xs text-[var(--muted)]">Cancelled</span>;
  }

  return (
    <span className="text-sm tabular-nums text-[var(--fg)]">{ctTime(m.kickoff)}</span>
  );
}
