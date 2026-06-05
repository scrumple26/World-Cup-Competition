"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildLeaderboard, buildChartSeries, buildRankSeries } from "@/lib/league";
import { StandingsTable } from "./StandingsTable";
import { CumulativeChart } from "./CumulativeChart";
import { RankingsChart } from "./RankingsChart";

export function LeaderboardClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading leaderboard…</p>;
  }

  const rows = buildLeaderboard(data.users, data.scores);

  const pointsSeries = buildChartSeries(
    rows.map((r) => ({ teamName: r.user.teamName, history: r.score.history })),
  );
  const rankSeries = buildRankSeries(
    rows.map((r) => r.user),
    Object.fromEntries(rows.map((r) => [r.user.uid, r.score])),
  );

  return (
    <div className="space-y-5">
      <div className="card p-4">
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
