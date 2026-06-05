"use client";

import { useMemo, useState } from "react";
import { useWcData } from "@/lib/useWcData";
import { isPlayed } from "@/lib/wcMap";
import type { WcGroupStanding } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

// ---- helpers ----

const CT = "America/Chicago";

function ctTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

const KNOCKOUT_ORDER = [
  "Round of 32", "Round of 16", "Quarter-finals",
  "Semi-finals", "3rd Place Final", "Final",
];

function roundOrder(round: string): number {
  const idx = KNOCKOUT_ORDER.findIndex((r) => round.includes(r));
  return idx === -1 ? 99 : idx;
}

// ---- tab types ----

type Tab = "standings" | "schedule" | "knockout";
const TABS: { id: Tab; label: string }[] = [
  { id: "standings", label: "Standings" },
  { id: "schedule",  label: "Schedule"  },
  { id: "knockout",  label: "Knockout"  },
];

// ---- main component ----

export function WorldCupClient() {
  const { data: wc, loading } = useWcData();
  const [tab, setTab] = useState<Tab>("standings");

  if (loading || !wc) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const noData = wc.standings.length === 0 && wc.fixtures.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">World Cup 2026</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--muted)]">Via API-Football · updates every 3 hrs</span>
          <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-[#06210f]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {noData && (
        <p className="text-[var(--muted)]">No data yet — use Admin → Sync now to pull live data.</p>
      )}

      {!noData && tab === "standings" && <StandingsView standings={wc.standings} />}
      {!noData && tab === "schedule"  && <ScheduleClient />}
      {!noData && tab === "knockout"  && <KnockoutView fixtures={wc.fixtures} />}
    </div>
  );
}

// ---- Standings ----

function StandingsView({ standings }: { standings: WcGroupStanding[] }) {
  if (standings.length === 0) {
    return <p className="text-[var(--muted)]">Standings not yet available.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {standings.map((g) => <GroupTable key={g.group} group={g} />)}
    </div>
  );
}

function GroupTable({ group: g }: { group: WcGroupStanding }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-[var(--bg-elev)] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-2)]">
        {g.group}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
            <th className="w-6 px-2 py-1.5 text-left">#</th>
            <th className="px-2 py-1.5 text-left">Team</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Played">P</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Won">W</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Drawn">D</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Lost">L</th>
            <th className="w-9 px-1 py-1.5 text-center" title="GD">GD</th>
            <th className="w-8 px-2 py-1.5 text-right font-bold" title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r, i) => (
            <tr
              key={r.teamId}
              className={`border-t border-[var(--border)] ${
                i < 2 ? "bg-[var(--accent)]/5" : i === 2 ? "bg-amber-500/5" : ""
              }`}
            >
              <td className="px-2 py-2 text-[var(--muted)]">{r.rank}</td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-1.5">
                  {r.logo && <img src={r.logo} alt="" width={16} height={16} className="h-4 w-4 rounded-sm object-contain flex-shrink-0" />}
                  <span className="truncate font-medium">{r.teamName}</span>
                </span>
              </td>
              <td className="px-1 py-2 text-center text-[var(--muted)]">{r.played}</td>
              <td className="px-1 py-2 text-center">{r.win}</td>
              <td className="px-1 py-2 text-center text-[var(--muted)]">{r.draw}</td>
              <td className="px-1 py-2 text-center text-[var(--muted)]">{r.lose}</td>
              <td className="px-1 py-2 text-center text-[var(--muted)]">
                {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
              </td>
              <td className="px-2 py-2 text-right font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-[var(--border)] px-3 py-1.5 flex gap-3 text-[10px] text-[var(--muted)]">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-[var(--accent)]/30 mr-1" />Qualifies</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-500/30 mr-1" />May advance (best 3rd)</span>
      </div>
    </div>
  );
}

// ---- Knockout ----

function KnockoutView({ fixtures }: { fixtures: WcMatch[] }) {
  const rounds = useMemo(() => {
    const ko = fixtures.filter((m) => !m.round.startsWith("Group Stage"));
    const map = new Map<string, WcMatch[]>();
    for (const m of ko) {
      const r = m.round;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(m);
    }
    return [...map.entries()]
      .sort(([a], [b]) => roundOrder(a) - roundOrder(b))
      .map(([round, matches]) => ({
        round,
        matches: matches.sort(
          (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
        ),
      }));
  }, [fixtures]);

  if (rounds.length === 0) {
    return (
      <p className="text-[var(--muted)]">
        Knockout fixtures not yet available — check back once the group stage is complete.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {rounds.map(({ round, matches }) => (
        <section key={round}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            {round}
          </h2>
          <div className="card divide-y divide-[var(--border)] overflow-hidden">
            {matches.map((m) => (
              <KoMatchRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function KoMatchRow({ match: m }: { match: WcMatch }) {
  const played = isPlayed(m);
  const live = ["1H", "HT", "2H", "ET", "P", "BT"].includes(m.status);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
      {/* Home */}
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-sm font-medium">{m.homeTeamName || "TBD"}</span>
        {m.homeLogo && <img src={m.homeLogo} alt="" width={36} height={24} className="h-6 w-9 flex-shrink-0 rounded-sm object-contain" />}
      </div>

      {/* Center */}
      <div className="flex w-28 flex-col items-center gap-0.5">
        {played ? (
          <span className="font-mono text-base font-bold">
            {m.goals.home}&nbsp;–&nbsp;{m.goals.away}
            {m.status === "AET" && <span className="ml-1 text-[9px] text-[var(--muted)]">AET</span>}
            {m.status === "PEN" && <span className="ml-1 text-[9px] text-[var(--muted)]">PEN</span>}
          </span>
        ) : live ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="font-mono text-sm font-bold text-green-400">
              {m.goals.home !== null ? `${m.goals.home} – ${m.goals.away}` : "LIVE"}
            </span>
          </span>
        ) : (
          <span className="text-center text-xs tabular-nums text-[var(--muted)]">
            {m.homeTeamName ? ctTime(m.kickoff) : "TBD"}
          </span>
        )}
      </div>

      {/* Away */}
      <div className="flex min-w-0 items-center gap-2">
        {m.awayLogo && <img src={m.awayLogo} alt="" width={36} height={24} className="h-6 w-9 flex-shrink-0 rounded-sm object-contain" />}
        <span className="truncate text-sm font-medium">{m.awayTeamName || "TBD"}</span>
      </div>
    </div>
  );
}
