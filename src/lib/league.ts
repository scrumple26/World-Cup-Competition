/** Pure derivations for friend-group standings, leaderboard, and chart series. */

import { compareStanding, type StandingStats } from "./scoring";
import { FRIEND_GROUPS, type FriendGroup } from "./wc";
import type { ScoreDoc, UserProfile } from "./types";

export interface RankedRow {
  user: UserProfile;
  score: ScoreDoc;
  rank: number;
  qualified: boolean; // top 2 of friend-group
}

function stats(u: UserProfile, s: ScoreDoc): StandingStats {
  return {
    uid: u.uid,
    groupPoints: s.total,
    perfectScores: s.perfectScores,
    perfectGroups: s.perfectGroups,
  };
}

/** Rank a list of users by score (best first), marking top `qualifyCount` as qualified. */
export function rankUsers(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
  qualifyCount = Infinity,
): RankedRow[] {
  return [...users]
    .sort((a, b) => compareStanding(stats(a, scores[a.uid]), stats(b, scores[b.uid])))
    .map((user, i) => ({
      user,
      score: scores[user.uid],
      rank: i + 1,
      qualified: i < qualifyCount,
    }));
}

/** Standings for each friend-group A–D; top 2 marked qualified. */
export function buildGroupStandings(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
): Record<FriendGroup, RankedRow[]> {
  const out = {} as Record<FriendGroup, RankedRow[]>;
  for (const g of FRIEND_GROUPS) {
    const members = users.filter((u) => u.friendGroup === g);
    out[g] = rankUsers(members, scores, 2);
  }
  return out;
}

/** Overall leaderboard across all participants. */
export function buildLeaderboard(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
): RankedRow[] {
  return rankUsers(users, scores);
}

export interface ChartSeries {
  data: Record<string, number | string>[];
  keys: string[]; // team names = line keys
}

/**
 * Build rank-over-time series. Lower rank = better (1 = first place).
 * Returns chart-ready data where each row is a date and each key is a teamName → rank.
 */
export function buildRankSeries(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
): ChartSeries {
  // Collect all unique dates across all histories
  const seen = new Set<string>();
  const dateOrder: string[] = [];
  for (const u of users) {
    for (const h of (scores[u.uid]?.history ?? [])) {
      if (!seen.has(h.date)) { seen.add(h.date); dateOrder.push(h.date); }
    }
  }
  dateOrder.sort(); // chronological

  const lastTotals: Record<string, number> = {};

  const data = dateOrder.map((date) => {
    // Update running totals
    for (const u of users) {
      const hit = scores[u.uid]?.history.find((h) => h.date === date);
      if (hit) lastTotals[u.uid] = hit.total;
    }
    // Rank at this date
    const sorted = [...users].sort((a, b) => (lastTotals[b.uid] ?? 0) - (lastTotals[a.uid] ?? 0));
    const row: Record<string, string | number> = { date };
    sorted.forEach((u, i) => { row[u.teamName] = i + 1; });
    return row;
  });

  return { data, keys: users.map((u) => u.teamName) };
}

/**
 * Build cumulative-points-over-time chart rows from members' score histories.
 * Dates are unioned in first-seen order; missing points carry forward.
 */
export function buildChartSeries(
  members: { teamName: string; history: { date: string; total: number }[] }[],
): ChartSeries {
  const dateOrder: string[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    for (const h of m.history) {
      if (!seen.has(h.date)) {
        seen.add(h.date);
        dateOrder.push(h.date);
      }
    }
  }
  const last: Record<string, number> = {};
  const data = dateOrder.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const m of members) {
      const hit = m.history.find((h) => h.date === date);
      if (hit) last[m.teamName] = hit.total;
      row[m.teamName] = last[m.teamName] ?? 0;
    }
    return row;
  });
  return { data, keys: members.map((m) => m.teamName) };
}
