"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildLeaderboard, buildChartSeries } from "@/lib/league";
import { StandingsTable } from "./StandingsTable";
import { CumulativeChart } from "./CumulativeChart";

export function LeaderboardClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading leaderboard…</p>;
  }

  const rows = buildLeaderboard(data.users, data.scores);
  // Chart the top 8 to keep it readable.
  const series = buildChartSeries(
    rows.slice(0, 8).map((r) => ({ teamName: r.user.teamName, history: r.score.history })),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <div className="card p-4">
        <StandingsTable rows={rows} highlightUid={user?.uid} showGroup />
      </div>
      <section className="card p-4">
        <div className="label">Top 8 — cumulative points over time</div>
        <CumulativeChart series={series} />
      </section>
    </div>
  );
}
