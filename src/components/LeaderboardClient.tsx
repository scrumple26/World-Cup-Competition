"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildLeaderboard, buildChartSeries, buildRankSeries } from "@/lib/league";
import { StandingsTable } from "./StandingsTable";
import { CumulativeChart } from "./CumulativeChart";
import { RankingsChart } from "./RankingsChart";

export function LeaderboardClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();
  const [sliderIdx, setSliderIdx] = useState(-1);

  const allDates = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const dates: string[] = [];
    for (const u of data.users) {
      for (const h of (data.scores[u.uid]?.history ?? [])) {
        if (!seen.has(h.date)) { seen.add(h.date); dates.push(h.date); }
      }
    }
    return dates.sort();
  }, [data]);

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading leaderboard…</p>;
  }

  const maxIdx = allDates.length - 1;
  const resolvedIdx = sliderIdx < 0 ? maxIdx : Math.min(sliderIdx, maxIdx);
  const selectedDate = allDates[resolvedIdx] ?? null;
  const isLive = resolvedIdx >= maxIdx;

  const snapshotScores = isLive ? data.scores : Object.fromEntries(
    data.users.map(u => {
      const s = data.scores[u.uid];
      const history = s?.history ?? [];
      const relevant = history.filter(h => h.date <= selectedDate!);
      const total = relevant.length ? relevant[relevant.length - 1].total : 0;
      return [u.uid, { ...s, total }];
    })
  );

  const rows = buildLeaderboard(data.users, snapshotScores);

  const pointsSeries = buildChartSeries(
    data.users.map(u => ({ teamName: u.teamName, history: data.scores[u.uid]?.history ?? [] })),
  );
  const rankSeries = buildRankSeries(
    data.users,
    data.scores,
  );

  return (
    <div className="space-y-5">
      {/* Timeline scrubber */}
      {allDates.length > 1 && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-widest text-[var(--muted)]">Timeline</span>
            <span className={`font-bold tabular-nums ${isLive ? "text-[var(--accent)]" : "text-[var(--fg)]"}`}>
              {isLive ? "Live" : selectedDate}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={resolvedIdx}
            onChange={e => setSliderIdx(Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[var(--muted)]">
            <span>{allDates[0]}</span>
            <span className="text-[var(--accent)]">Live</span>
          </div>
        </div>
      )}

      <div className="card p-4">
        {!isLive && (
          <div className="mb-3 rounded-lg bg-[var(--accent-2)]/10 px-3 py-2 text-xs text-[var(--accent-2)]">
            Showing standings as of <b>{selectedDate}</b> · drag slider to Live to see current
          </div>
        )}
        <StandingsTable rows={rows} highlightUid={user?.uid} showGroup />
        <p className="mt-2 text-[10px] text-[var(--muted)]">
          W% = correct outcome predictions · Score% = exact scoreline
        </p>
      </div>

      <section className="card p-4">
        <div className="label mb-3">Cumulative points — all players</div>
        <CumulativeChart series={pointsSeries} />
      </section>

      <section className="card p-4">
        <div className="label mb-1">Rankings over time — all players</div>
        <p className="mb-3 text-xs text-[var(--muted)]">Lower = better · step jumps when a result changes the order</p>
        <RankingsChart series={rankSeries} playerCount={data.users.length} />
      </section>
    </div>
  );
}
