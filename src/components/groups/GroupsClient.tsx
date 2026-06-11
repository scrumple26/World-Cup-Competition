"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeague } from "@/lib/useLeague";
import { buildGroupStandings, buildChartSeries, buildProjectionRows } from "@/lib/league";
import { useLiveGfcPoints } from "@/lib/useLiveGfcPoints";
import type { ScoreDoc } from "@/lib/types";
import { FRIEND_GROUPS, type FriendGroup } from "@/lib/wc";
import { StandingsTable } from "../StandingsTable";
import { CumulativeChart } from "../CumulativeChart";
import { ProjectionChart } from "../ProjectionChart";
import { WinProbabilityChart } from "../WinProbabilityChart";

export function GroupsClient() {
  const { user } = useAuth();
  const { data, loading } = useLeague();
  const { deltaByUid, liveActive } = useLiveGfcPoints();
  const [tab, setTab] = useState<"mine" | "all">("mine");

  if (loading || !data) {
    return <p className="text-[var(--muted)]">Loading standings…</p>;
  }

  const liveScores: Record<string, ScoreDoc> = liveActive
    ? Object.fromEntries(
        Object.entries(data.scores).map(([uid, s]) => [uid, { ...s, total: s.total + (deltaByUid[uid] ?? 0) }]),
      )
    : data.scores;
  const standings = buildGroupStandings(data.users, liveScores);
  const myGroup = user?.friendGroup;
  const groupsToShow: FriendGroup[] =
    tab === "mine" && myGroup ? [myGroup] : [...FRIEND_GROUPS];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Groups</h1>
          {liveActive && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-green-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              live
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-[var(--border)] p-1">
          {(
            [
              ["mine", "My group"],
              ["all", "All groups"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                tab === t ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={tab === "all" ? "grid gap-5 lg:grid-cols-2" : "space-y-5"}>
        {groupsToShow.map((g) => {
          const rows = standings[g];
          const series = buildChartSeries(
            rows.map((r) => ({ teamName: r.user.teamName, history: r.score.history })),
          );
          const projRows = buildProjectionRows(rows, data.playedMatchCount, data.totalMatchCount);
          return (
            <section key={g} className="card p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="chip bg-[var(--accent-2)]/15 text-[var(--accent-2)]">
                  Group {g}
                </span>
                {g === myGroup && (
                  <span className="chip bg-[var(--accent)]/15 text-[var(--accent)]">
                    Your group
                  </span>
                )}
              </div>
              <StandingsTable rows={rows} highlightUid={user?.uid} showQualify />
              <div className="mt-4">
                <div className="label">Cumulative points over time</div>
                <CumulativeChart series={series} />
              </div>
              <div className="mt-5">
                <div className="label mb-2">Projected final standings</div>
                <ProjectionChart
                  rows={projRows}
                  playedMatchCount={data.playedMatchCount}
                  totalMatchCount={data.totalMatchCount}
                />
              </div>
              <div className="mt-5">
                <div className="label mb-2">Win probability</div>
                <WinProbabilityChart
                  rows={rows}
                  playedMatchCount={data.playedMatchCount}
                  totalMatchCount={data.totalMatchCount}
                  highlightUid={user?.uid}
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-[var(--muted)]">
        ● marks the top 2 in each group, who advance to the knockout bracket.
      </p>
    </div>
  );
}
