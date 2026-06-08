"use client";

import { useMemo } from "react";
import type { RankedRow } from "@/lib/league";

// ── simulation ────────────────────────────────────────────────────────────────

function randn(): number {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface SimRow {
  uid: string;
  teamName: string;
  logoUrl?: string;
  current: number;
  pWin: number;
  pTop2: number;
}

const N = 10_000;
const PER_MATCH_SD = 1.0; // estimated stddev of pts per match

function simulate(
  rows: RankedRow[],
  playedMatchCount: number,
  totalMatchCount: number,
): SimRow[] {
  const remaining = Math.max(0, totalMatchCount - playedMatchCount);

  const players = rows.map((r) => ({
    uid: r.user.uid,
    teamName: r.user.teamName,
    logoUrl: r.user.logoUrl,
    current: r.score.total,
    mu: playedMatchCount > 0 ? r.score.total / playedMatchCount : 0,
  }));

  // No remaining matches — result is certain
  if (remaining === 0) {
    const sorted = [...players].sort((a, b) => b.current - a.current);
    return sorted.map((p, i) => ({
      ...p,
      pWin: i === 0 ? 1 : 0,
      pTop2: i < 2 ? 1 : 0,
    }));
  }

  const winCount = new Map(players.map((p) => [p.uid, 0]));
  const top2Count = new Map(players.map((p) => [p.uid, 0]));
  const sd = PER_MATCH_SD * Math.sqrt(remaining);

  for (let sim = 0; sim < N; sim++) {
    const finals = players.map((p) => ({
      uid: p.uid,
      score: p.current + p.mu * remaining + randn() * sd,
    }));
    finals.sort((a, b) => b.score - a.score);
    winCount.set(finals[0].uid, (winCount.get(finals[0].uid) ?? 0) + 1);
    top2Count.set(finals[0].uid, (top2Count.get(finals[0].uid) ?? 0) + 1);
    if (finals[1]) top2Count.set(finals[1].uid, (top2Count.get(finals[1].uid) ?? 0) + 1);
  }

  return players.map((p) => ({
    ...p,
    pWin: (winCount.get(p.uid) ?? 0) / N,
    pTop2: (top2Count.get(p.uid) ?? 0) / N,
  })).sort((a, b) => b.pTop2 - a.pTop2);
}

// ── component ─────────────────────────────────────────────────────────────────

export function WinProbabilityChart({
  rows,
  playedMatchCount,
  totalMatchCount,
  highlightUid,
}: {
  rows: RankedRow[];
  playedMatchCount: number;
  totalMatchCount: number;
  highlightUid?: string;
}) {
  const results = useMemo(
    () => simulate(rows, playedMatchCount, totalMatchCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.map((r) => r.score.total).join(","), playedMatchCount, totalMatchCount],
  );

  if (playedMatchCount === 0) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-[var(--muted)]">
        Win probabilities appear once matches are scored.
      </div>
    );
  }

  const remaining = Math.max(0, totalMatchCount - playedMatchCount);

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted)]">
        Monte Carlo simulation · {N.toLocaleString()} runs · {remaining} matches remaining
      </p>
      {results.map((r) => {
        const isMe = r.uid === highlightUid;
        const top2Pct = Math.round(r.pTop2 * 100);
        const winPct = Math.round(r.pWin * 100);
        return (
          <div key={r.uid} className={`rounded-lg p-3 ${isMe ? "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30" : "bg-[var(--bg-elev)]"}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {r.logoUrl ? (
                  <img src={r.logoUrl} alt="" className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--border)] text-[9px] font-bold text-[var(--muted)] flex-shrink-0">
                    {r.teamName.charAt(0)}
                  </span>
                )}
                <span className={`truncate text-sm font-medium ${isMe ? "text-[var(--accent)]" : ""}`}>
                  {r.teamName}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs flex-shrink-0">
                <span className="text-[var(--muted)]">Win <span className="font-bold text-[var(--fg)]">{winPct}%</span></span>
                <span className="text-[var(--muted)]">Qualify <span className={`font-bold ${top2Pct >= 50 ? "text-[var(--accent)]" : "text-[var(--fg)]"}`}>{top2Pct}%</span></span>
              </div>
            </div>
            {/* Qualify probability bar */}
            <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${top2Pct}%`,
                  background: top2Pct >= 50
                    ? "var(--accent)"
                    : top2Pct >= 25
                    ? "var(--accent-2)"
                    : "var(--muted)",
                }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[10px] text-[var(--muted)]">
        Based on each player&apos;s current pts/match rate. Top 2 qualify.
      </p>
    </div>
  );
}
