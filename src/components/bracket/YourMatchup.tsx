"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchFixtures } from "@/lib/wcClient";
import { POINTS, scoreMatch } from "@/lib/scoring";
import { isPlayed } from "@/lib/wcMap";
import type { BracketMatchup, BracketTeam } from "@/lib/bracket";
import type { MatchPrediction, WcMatch } from "@/lib/types";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT", "LIVE"]);
const DONE_STATUSES = new Set(["FT", "AET", "PEN"]);

// Most a single match can yield: correct outcome + both exact scores + perfect bonus.
const MAX_PER_MATCH = POINTS.outcome + 2 * POINTS.exactSide + POINTS.perfectBonus;
// World Cup group stage games — everyone predicts all of them.
const GROUP_GAMES = 72;

/** Score one prediction against a fixture's current scoreline (0 if unplayed). */
function pointsFor(pred: MatchPrediction | undefined, m: WcMatch): number {
  if (!pred || m.goals.home == null || m.goals.away == null) return 0;
  return scoreMatch(
    { home: pred.home, away: pred.away },
    { home: m.goals.home, away: m.goals.away },
    m.decidedWinner,
    pred.predictedWinner,
  ).total;
}

/** Trim trailing ".0" but keep halves (points come in 0.5 steps). */
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" }).format(new Date(iso));

// ---- Small presentational helpers ----

function Avatar({ logo, name, ring }: { logo?: string; name: string; ring: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-full border object-cover" style={{ borderColor: ring }} />
  ) : (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-[var(--bg-card)] text-xs font-bold text-[var(--muted)]"
      style={{ borderColor: ring }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function StatCard({
  who,
  accent,
  groupPts,
  avg,
  ceiling,
}: {
  who: string;
  accent: string;
  groupPts: number;
  avg: number;
  ceiling: number;
}) {
  return (
    <div className="space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-2 text-xs">
      <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
        {who}
      </div>
      <StatRow label="Group pts" value={fmt(groupPts)} />
      <StatRow label="Avg / game" value={avg.toFixed(2)} />
      <StatRow label="Max this round" value={fmt(ceiling)} />
    </div>
  );
}

interface Point {
  label: string;
  match: string;
  you: number;
  opp: number;
}

function ChartTooltip({
  active,
  payload,
  youName,
  oppName,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  youName: string;
  oppName: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-[var(--fg)]">{p.match}</div>
      <div className="text-[var(--accent)]">{youName}: {p.you} pts</div>
      <div className="text-[var(--accent-2)]">{oppName}: {p.opp} pts</div>
    </div>
  );
}

/**
 * The signed-in player's current knockout matchup, plus a chart of how each
 * side's head-to-head points have moved over the round's World Cup games.
 *
 * Predictions are immutable after kickoff, so we fetch the round's fixtures and
 * both players' picks once, then build a cumulative series in kickoff order —
 * a point per game that has kicked off (live or finished).
 */
export function YourMatchup({
  matchup,
  myUid,
  wcRounds,
  roundLabel,
  roundComplete,
  logos,
}: {
  matchup: BracketMatchup;
  myUid: string;
  wcRounds: string[];
  roundLabel: string;
  roundComplete?: boolean;
  logos: Record<string, string | undefined>;
}) {
  const me: BracketTeam | null = matchup.a?.uid === myUid ? matchup.a : matchup.b;
  const opp: BracketTeam | null = matchup.a?.uid === myUid ? matchup.b : matchup.a;
  const meUid = me?.uid;
  const oppUid = opp?.uid;

  const [fixtures, setFixtures] = useState<WcMatch[]>([]);
  const [predsMe, setPredsMe] = useState<Record<number, MatchPrediction>>({});
  const [predsOpp, setPredsOpp] = useState<Record<number, MatchPrediction>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meUid || !oppUid) return;
    let active = true;
    setLoading(true);
    Promise.all([
      Promise.all(wcRounds.map((r) => fetchFixtures(r))).then((a) => a.flat()),
      fetch(`/api/predictions?uid=${meUid}`).then((r) => r.json()).then((d) => d.matches ?? {}),
      fetch(`/api/predictions?uid=${oppUid}`).then((r) => r.json()).then((d) => d.matches ?? {}),
    ])
      .then(([fx, pMe, pOpp]) => {
        if (!active) return;
        setFixtures(
          (fx as WcMatch[]).sort(
            (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
          ),
        );
        setPredsMe(pMe);
        setPredsOpp(pOpp);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [meUid, oppUid, wcRounds]);

  const series = useMemo<Point[]>(() => {
    const live = (m: WcMatch) => isPlayed(m) || LIVE_STATUSES.has(m.status);
    const played = fixtures.filter(live);
    let you = 0;
    let oppPts = 0;
    const pts: Point[] = [{ label: "Start", match: "Round start", you: 0, opp: 0 }];
    for (const m of played) {
      you += pointsFor(predsMe[m.id], m);
      oppPts += pointsFor(predsOpp[m.id], m);
      pts.push({
        label: dayLabel(m.kickoff),
        match: `${m.homeTeamName} v ${m.awayTeamName}`,
        you,
        opp: oppPts,
      });
    }
    return pts;
  }, [fixtures, predsMe, predsOpp]);

  // Locked points (finished games only) and how much is still up for grabs.
  const standing = useMemo(() => {
    const finals = fixtures.filter((m) => DONE_STATUSES.has(m.status));
    let lockedYou = 0;
    let lockedOpp = 0;
    for (const m of finals) {
      lockedYou += pointsFor(predsMe[m.id], m);
      lockedOpp += pointsFor(predsOpp[m.id], m);
    }
    const remaining = fixtures.length - finals.length;
    const pool = MAX_PER_MATCH * remaining;
    return {
      total: fixtures.length,
      remaining,
      pool,
      ceilingYou: lockedYou + pool,
      ceilingOpp: lockedOpp + pool,
    };
  }, [fixtures, predsMe, predsOpp]);

  const youTotal = series[series.length - 1]?.you ?? 0;
  const oppTotal = series[series.length - 1]?.opp ?? 0;
  const hasData = series.length > 1;
  const youLeading = youTotal > oppTotal;
  const tied = youTotal === oppTotal;

  if (!me) return null;

  const statusChip = roundComplete
    ? { text: "Final", cls: "bg-[var(--accent)]/15 text-[var(--accent)]" }
    : hasData
    ? { text: "Live", cls: "bg-green-500/15 text-green-400" }
    : { text: "Upcoming", cls: "bg-amber-500/15 text-amber-300" };

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Your matchup · {roundLabel}</h2>
        <span className={`chip ${statusChip.cls}`}>{statusChip.text}</span>
      </div>

      {!opp ? (
        <p className="rounded-lg bg-[var(--bg-elev)] px-4 py-6 text-center text-sm text-[var(--muted)]">
          Awaiting your opponent — the previous round needs to finish first.
        </p>
      ) : (
        <>
          {/* Score line with logos */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex min-w-0 items-center justify-end gap-2">
              <div className={`min-w-0 text-right ${youLeading && !tied ? "font-bold" : ""}`}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--accent)]">You</div>
                <div className="truncate text-sm">#{me.seed} {me.teamName}</div>
              </div>
              <Avatar logo={logos[me.uid]} name={me.teamName} ring="var(--accent)" />
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 font-mono text-2xl font-bold tabular-nums">
                <span className={youLeading && !tied ? "text-[var(--accent)]" : "text-[var(--muted)]"}>{fmt(youTotal)}</span>
                <span className="text-sm text-[var(--muted)]">–</span>
                <span className={!youLeading && !tied ? "text-[var(--accent-2)]" : "text-[var(--muted)]"}>{fmt(oppTotal)}</span>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--muted)]">round points</div>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Avatar logo={logos[opp.uid]} name={opp.teamName} ring="var(--accent-2)" />
              <div className={`min-w-0 ${!youLeading && !tied ? "font-bold" : ""}`}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--accent-2)]">Opponent</div>
                <div className="truncate text-sm">#{opp.seed} {opp.teamName}</div>
              </div>
            </div>
          </div>

          {/* Group-stage form + max still reachable this round */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard who={me.teamName} accent="var(--accent)" groupPts={me.points} avg={me.points / GROUP_GAMES} ceiling={standing.ceilingYou} />
            <StatCard who={opp.teamName} accent="var(--accent-2)" groupPts={opp.points} avg={opp.points / GROUP_GAMES} ceiling={standing.ceilingOpp} />
          </div>

          {/* Potential points still in play this round */}
          {standing.remaining > 0 && (
            <div className="rounded-lg bg-[var(--bg-elev)] px-4 py-2 text-center text-xs text-[var(--muted)]">
              🎯 <b className="text-[var(--fg)]">{fmt(standing.pool)}</b> pts still on the table ·{" "}
              {standing.remaining} of {standing.total} games left
            </div>
          )}

          {/* Points-over-time chart */}
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">Loading points history…</p>
          ) : !hasData ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              Points will plot here once this round&apos;s games kick off.
            </p>
          ) : (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
                Head-to-head points over the round
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--border)" />
                  <Tooltip
                    content={<ChartTooltip youName={me.teamName} oppName={opp.teamName} />}
                  />
                  <Line type="monotone" dataKey="you" name={me.teamName} stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="opp" name={opp.teamName} stroke="var(--accent-2)" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-1 flex items-center justify-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm" style={{ background: "var(--accent)" }} /> {me.teamName}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-3 rounded-sm" style={{ background: "var(--accent-2)" }} /> {opp.teamName}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
