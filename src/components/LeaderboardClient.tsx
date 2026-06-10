"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildLeaderboard, buildChartSeries, buildRankSeries } from "@/lib/league";
import { StandingsTable } from "./StandingsTable";
import { StandingsTrendChart } from "./StandingsTrendChart";

export function LeaderboardClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading leaderboard…</p>;
  }

  const rows = buildLeaderboard(data.users, data.scores);

  const pointsSeries = buildChartSeries(
    data.users.map((u) => ({ teamName: u.teamName, history: data.scores[u.uid]?.history ?? [] })),
  );
  const rankSeries = buildRankSeries(data.users, data.scores);

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <StandingsTable rows={rows} highlightUid={user?.uid} showGroup />
        <p className="mt-2 text-[10px] text-[var(--muted)]">
          W% = correct outcome predictions · Score% = exact scoreline
        </p>
      </div>

      <section className="card p-4">
        <StandingsTrendChart
          pointsSeries={pointsSeries}
          rankSeries={rankSeries}
          playerCount={data.users.length}
        />
      </section>
    </div>
  );
}
