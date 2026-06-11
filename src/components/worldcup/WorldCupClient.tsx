"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWcData } from "@/lib/useWcData";
import { isPlayed } from "@/lib/wcMap";
import type { WcGroupStanding } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

// ---- helpers ----

const CT = "America/Chicago";
const POLL_MS = 60_000;                // 1 minute while matches are in play
const POST_WINDOW_MS = 30 * 60_000;    // 30 min after last kickoff + ~95 min match
const MATCH_DURATION_MS = 95 * 60_000; // generous max match length

function ctDateStr(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ts);
}

/**
 * Returns the [windowStart, windowEnd] for standing updates today, or null if
 * there are no fixtures today or the window hasn't started / has already ended.
 */
function todaysPollWindow(fixtures: WcMatch[]): [number, number] | null {
  const todayStr = ctDateStr(Date.now());
  const today = fixtures.filter(
    (m) => ctDateStr(new Date(m.kickoff).getTime()) === todayStr,
  );
  if (today.length === 0) return null;
  const kickoffs = today.map((m) => new Date(m.kickoff).getTime());
  const first = Math.min(...kickoffs);
  const last  = Math.max(...kickoffs);
  return [first, last + MATCH_DURATION_MS + POST_WINDOW_MS];
}

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

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);

/**
 * Overlay in-progress group-match scores onto the official standings to produce
 * a PROVISIONAL table — i.e. where teams would sit if the current live scores
 * held. Pure; computed on the client, so it costs nothing in Firestore.
 */
function applyLiveResults(
  standings: WcGroupStanding[],
  liveMatches: WcMatch[],
): { standings: WcGroupStanding[]; liveTeamIds: Set<number> } {
  const liveTeamIds = new Set<number>();
  const live = liveMatches.filter(
    (m) => m.round.startsWith("Group Stage") && LIVE_STATUSES.has(m.status) && m.goals.home != null && m.goals.away != null,
  );
  if (live.length === 0) return { standings, liveTeamIds };

  const out = standings.map((g) => {
    const rows = g.rows.map((r) => ({ ...r }));
    const byId = new Map(rows.map((r) => [r.teamId, r] as const));
    for (const m of live) {
      const home = byId.get(m.homeTeamId);
      const away = byId.get(m.awayTeamId);
      if (!home || !away) continue; // match isn't in this group
      const hg = m.goals.home as number;
      const ag = m.goals.away as number;
      liveTeamIds.add(m.homeTeamId);
      liveTeamIds.add(m.awayTeamId);
      home.played += 1; away.played += 1;
      home.gf += hg; home.ga += ag; away.gf += ag; away.ga += hg;
      home.goalsDiff = home.gf - home.ga;
      away.goalsDiff = away.gf - away.ga;
      if (hg > ag) { home.points += 3; home.win += 1; away.lose += 1; }
      else if (hg < ag) { away.points += 3; away.win += 1; home.lose += 1; }
      else { home.points += 1; away.points += 1; home.draw += 1; away.draw += 1; }
    }
    rows.sort((a, b) =>
      b.points - a.points || b.goalsDiff - a.goalsDiff || b.gf - a.gf || a.teamName.localeCompare(b.teamName),
    );
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { ...g, rows };
  });
  return { standings: out, liveTeamIds };
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
  const [liveStandings, setLiveStandings] = useState<WcGroupStanding[] | null>(null);
  const [liveMatches, setLiveMatches] = useState<WcMatch[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll standings every minute while we're in the active game window for today.
  useEffect(() => {
    if (!wc || tab !== "standings") return;

    const window = todaysPollWindow(wc.fixtures);
    const now = Date.now();
    if (!window || now < window[0] || now > window[1]) return;

    async function poll() {
      try {
        const res = await fetch("/api/wc/standings");
        if (!res.ok) return;
        const data = await res.json() as { groups: WcGroupStanding[] };
        if (data.groups?.length) setLiveStandings(data.groups);
      } catch { /* silent */ }
    }

    setPollingActive(true);
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPollingActive(false);
    };
  }, [wc, tab]);

  // Poll in-progress group matches every minute so standings can show a live,
  // provisional table. Pure client overlay — no Firestore reads/writes.
  useEffect(() => {
    if (!wc || tab !== "standings") { setLiveMatches([]); return; }
    const ids = wc.fixtures
      .filter((m) => m.round.startsWith("Group Stage"))
      .filter((m) => {
        const k = new Date(m.kickoff).getTime();
        return k <= Date.now() && Date.now() - k < 3 * 3600_000 && !["FT", "AET", "PEN"].includes(m.status);
      })
      .map((m) => m.id);
    if (ids.length === 0) { setLiveMatches([]); return; }
    let active = true;
    const idsStr = ids.join(",");
    async function poll() {
      try {
        const res = await fetch(`/api/wc/live?ids=${idsStr}`);
        if (!res.ok) return;
        const d = (await res.json()) as { matches?: WcMatch[] };
        if (active) setLiveMatches((d.matches ?? []).filter((m) => LIVE_STATUSES.has(m.status)));
      } catch { /* silent */ }
    }
    poll();
    const t = setInterval(poll, 60_000);
    return () => { active = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wc, tab]);

  const officialStandings = liveStandings ?? wc?.standings ?? [];
  const { standings: displayStandings, liveTeamIds } = applyLiveResults(officialStandings, liveMatches);

  if (loading || !wc) {
    return <p className="text-[var(--muted)]">Loading…</p>;
  }

  const noData = wc.standings.length === 0 && wc.fixtures.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">World Cup 2026</h1>
        <div className="flex items-center gap-3">
          {pollingActive ? (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live · updating every minute
          </span>
        ) : (
          <span className="text-xs text-[var(--muted)]">Via API-Football · live updates every minute during matches</span>
        )}
          <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
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

      {!noData && tab === "standings" && <StandingsView standings={displayStandings} liveTeamIds={liveTeamIds} />}
      {!noData && tab === "schedule"  && <ScheduleClient hideFilter />}
      {!noData && tab === "knockout"  && <KnockoutView fixtures={wc.fixtures} />}
    </div>
  );
}

// ---- Standings ----

function StandingsView({ standings, liveTeamIds }: { standings: WcGroupStanding[]; liveTeamIds: Set<number> }) {
  if (standings.length === 0) {
    return <p className="text-[var(--muted)]">Standings not yet available.</p>;
  }
  return (
    <div className="space-y-3">
      {liveTeamIds.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-green-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          Provisional standings — updating live as goals go in.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {standings.map((g) => <GroupTable key={g.group} group={g} liveTeamIds={liveTeamIds} />)}
      </div>
    </div>
  );
}

function GroupTable({ group: g, liveTeamIds }: { group: WcGroupStanding; liveTeamIds: Set<number> }) {
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
                  {liveTeamIds.has(r.teamId) && (
                    <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-green-500" title="Playing now — provisional" />
                  )}
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
