"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWcData } from "@/lib/useWcData";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isPlayed } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";
import type { LiveMatchDetails } from "@/app/api/wc/match/[id]/live/route";
import type { MatchPredictionEntry } from "@/app/api/wc/match/[id]/predictions/route";
import { displayName } from "@/lib/types";

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

export function ScheduleClient({ hideFilter = false }: { hideFilter?: boolean }) {
  const { data: wc, loading } = useWcData();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [live, setLive] = useState<Record<number, WcMatch>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [liveDetails, setLiveDetails] = useState<Record<number, LiveMatchDetails>>({});
  const [predsId, setPredsId] = useState<number | null>(null);
  const [matchPreds, setMatchPreds] = useState<Record<number, MatchPredictionEntry[]>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideScores = user?.hideScores ?? false;

  // Fetch detailed live data for the expanded match
  const fetchDetails = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/wc/match/${id}/live`);
      if (!res.ok) return;
      const data = await res.json() as LiveMatchDetails;
      setLiveDetails((prev) => ({ ...prev, [id]: data }));
    } catch { /* silent */ }
  }, []);

  // Toggle predictions panel for non-live matches
  async function togglePreds(id: number) {
    setPredsId((prev) => (prev === id ? null : id));
    if (matchPreds[id]) return; // already loaded
    try {
      const res = await fetch(`/api/wc/match/${id}/predictions`);
      if (!res.ok) return;
      const data = await res.json() as { predictions: MatchPredictionEntry[] };
      setMatchPreds((prev) => ({ ...prev, [id]: data.predictions }));
    } catch { /* silent */ }
  }

  // Toggle expanded match; fetch details immediately
  function toggleExpand(id: number) {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next !== null) fetchDetails(next);
      return next;
    });
  }

  // Score polling effect
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
        // Also refresh details if a match is expanded
        if (expandedId && ids.includes(expandedId)) fetchDetails(expandedId);
      } catch { /* silent */ }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [wc, expandedId, fetchDetails]);

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
        {!hideFilter && <h1 className="text-2xl font-bold">Schedule</h1>}
        <div className="flex items-center gap-3">
          {hideScores && (
            <span className="text-xs text-amber-400/80">Scores hidden</span>
          )}
          {!hideFilter && <div className="flex gap-1 rounded-lg border border-[var(--border)] p-1">
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
          </div>}
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
            {matches.map((m) => {
              const display = live[m.id] ?? m;
              const isLiveMatch = LIVE_STATUSES.has(display.status);
              const isDone = DONE_STATUSES.has(display.status);
              return (
                <div key={m.id}>
                  <MatchRow
                    match={display}
                    hideScores={hideScores}
                    expanded={expandedId === m.id || predsId === m.id}
                    onExpand={isLiveMatch ? () => toggleExpand(m.id) : () => togglePreds(m.id)}
                  />
                  {expandedId === m.id && isLiveMatch && (
                    <LivePanel
                      details={liveDetails[m.id] ?? null}
                      hideScores={hideScores}
                    />
                  )}
                  {predsId === m.id && !isLiveMatch && (
                    <PredsPanel
                      predictions={matchPreds[m.id] ?? null}
                      currentUid={user?.uid ?? null}
                      isLocked={isDone || isPlayed(display)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---- match row ----

function MatchRow({
  match: m,
  hideScores,
  expanded,
  onExpand,
}: {
  match: WcMatch;
  hideScores: boolean;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const played = isPlayed(m);
  const isLive = LIVE_STATUSES.has(m.status);

  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 ${onExpand ? "cursor-pointer hover:bg-[var(--bg-elev)]" : ""} ${expanded ? "bg-[var(--bg-elev)]" : ""}`}
      onClick={onExpand}
    >
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
    const min = m.elapsed != null ? `${m.elapsed}'` : (m.status === "HT" ? "HT" : "");
    if (hideScores) {
      return (
        <span className="flex flex-col items-center gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-sm font-semibold text-green-400">LIVE</span>
          </span>
          {min && <span className="text-[10px] text-green-400/70">{min}</span>}
        </span>
      );
    }
    return (
      <span className="flex flex-col items-center gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="font-mono text-sm font-bold text-green-400">
            {m.goals.home !== null ? `${m.goals.home} – ${m.goals.away}` : "LIVE"}
          </span>
        </span>
        {min && <span className="text-[10px] text-green-400/70">{min}</span>}
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

// ---- live details panel ----

const EVENT_ICON: Record<string, string> = {
  goal: "⚽",
  owngoal: "⚽ (OG)",
  penalty: "⚽ (P)",
  yellowcard: "🟨",
  redcard: "🟥",
  yellowredcard: "🟨🟥",
  sub: "🔄",
  var: "📺",
  other: "•",
};

function LivePanel({
  details,
  hideScores,
}: {
  details: LiveMatchDetails | null;
  hideScores: boolean;
}) {
  if (!details) {
    return (
      <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
        Loading live details…
      </div>
    );
  }

  const events = details.events.filter((e) => e.type !== "other" && e.type !== "sub" || e.type === "sub");

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elev)] px-4 py-3 space-y-3">
      {/* Events */}
      {events.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Match Events</div>
          <div className="space-y-1">
            {events.map((e, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs ${e.teamSide === "home" ? "flex-row" : "flex-row-reverse"}`}>
                <span className="w-8 shrink-0 text-center text-[var(--muted)] tabular-nums">
                  {e.minute}{e.extraMinute ? `+${e.extraMinute}` : ""}&apos;
                </span>
                <span>{EVENT_ICON[e.type] ?? "•"}</span>
                <span className="font-medium">{e.player}</span>
                {e.assist && e.type !== "sub" && (
                  <span className="text-[var(--muted)]">({e.assist})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {details.stats && !hideScores && (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">Live Stats</div>
          <div className="space-y-1.5 text-xs">
            <StatBar label="Possession" home={details.stats.home.possession} away={details.stats.away.possession} isPercent />
            <StatRow label="Shots" home={details.stats.home.shots} away={details.stats.away.shots} />
            <StatRow label="On Target" home={details.stats.home.shotsOnTarget} away={details.stats.away.shotsOnTarget} />
            <StatRow label="Corners" home={details.stats.home.corners} away={details.stats.away.corners} />
            <StatRow label="Fouls" home={details.stats.home.fouls} away={details.stats.away.fouls} />
          </div>
        </div>
      )}

      {events.length === 0 && !details.stats && (
        <p className="text-xs text-[var(--muted)]">No events yet.</p>
      )}
    </div>
  );
}

function StatBar({ label, home, away, isPercent }: { label: string; home: string | number; away: string | number; isPercent?: boolean }) {
  const h = parseFloat(String(home)) || 0;
  const total = isPercent ? 100 : (h + (parseFloat(String(away)) || 0)) || 1;
  const pct = Math.round((h / total) * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[var(--muted)]">
        <span>{home}{isPercent ? "" : ""}</span>
        <span className="font-medium text-[var(--fg)]">{label}</span>
        <span>{away}{isPercent ? "" : ""}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatRow({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="w-8 text-center font-medium">{home}</span>
      <span className="text-[var(--muted)]">{label}</span>
      <span className="w-8 text-center font-medium">{away}</span>
    </div>
  );
}

// ---- predictions panel ----

function PredsPanel({
  predictions,
  currentUid,
  isLocked,
}: {
  predictions: MatchPredictionEntry[] | null;
  currentUid: string | null;
  isLocked: boolean;
}) {
  if (!predictions) {
    return (
      <div className="border-t border-[var(--border)] bg-[var(--bg-elev)] px-4 py-3 text-xs text-[var(--muted)]">
        Loading predictions…
      </div>
    );
  }

  const myPred = predictions.find((p) => p.uid === currentUid);
  const canSee = isLocked || !!myPred;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--bg-elev)] px-4 py-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
        Predictions {isLocked ? "" : "· submit yours to see others'"}
      </div>

      {!canSee ? (
        <p className="text-xs text-[var(--muted)] italic">
          You haven&apos;t predicted this match yet. Submit your score to see what everyone else picked.
        </p>
      ) : predictions.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No predictions submitted yet.</p>
      ) : (
        <div className="space-y-1">
          {[...predictions]
            .sort((a, b) => a.teamName.localeCompare(b.teamName))
            .map((p) => {
            const isMe = p.uid === currentUid;
            return (
              <div
                key={p.uid}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${isMe ? "bg-[var(--accent)]/10 font-semibold" : ""}`}
              >
                {p.logoUrl ? (
                  <img src={p.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--border)] text-[9px] font-bold text-[var(--muted)] flex-shrink-0">
                    {p.teamName.charAt(0)}
                  </span>
                )}
                <span className="flex-1 truncate">{displayName(p)}</span>
                <span className="font-mono tabular-nums text-[var(--fg)]">
                  {p.home} – {p.away}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
