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

export type QualStatus = "winner" | "runnerup" | "wildcard" | "out";

export interface QualificationResult {
  /** uid → current knockout status. */
  statusByUid: Record<string, QualStatus>;
  /** The wildcard pool (everyone not a winner or top-3 runner-up), best first.
   *  Index 0 currently holds the wildcard (seed 8). */
  wildcardRace: { user: UserProfile; score?: ScoreDoc; points: number; group: FriendGroup }[];
}

const EMPTY_STATS: StandingStats = { uid: "", groupPoints: 0, perfectScores: 0, perfectGroups: 0 };

/**
 * Determine who currently qualifies for the knockout under the seeding rule:
 *   • the 4 group winners (seeds 1–4),
 *   • the 3 best runners-up (seeds 5–7),
 *   • a wildcard (seed 8) = best remaining anywhere.
 */
export function computeQualification(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
): QualificationResult {
  const st = (u: UserProfile): StandingStats => {
    const s = scores[u.uid];
    return s ? stats(u, s) : { ...EMPTY_STATS, uid: u.uid };
  };
  const cmp = (a: UserProfile, b: UserProfile) => compareStanding(st(a), st(b));

  const winners: UserProfile[] = [];
  const runnersUp: UserProfile[] = [];
  const rest: UserProfile[] = [];
  for (const g of FRIEND_GROUPS) {
    const ranked = users.filter((u) => u.friendGroup === g).sort(cmp);
    if (ranked[0]) winners.push(ranked[0]);
    if (ranked[1]) runnersUp.push(ranked[1]);
    if (ranked.length > 2) rest.push(...ranked.slice(2));
  }
  const rankedRunners = [...runnersUp].sort(cmp);
  const qualRunners = rankedRunners.slice(0, 3);
  const wildcardPool = [...rankedRunners.slice(3), ...rest].sort(cmp);

  const statusByUid: Record<string, QualStatus> = {};
  for (const u of users) statusByUid[u.uid] = "out";
  for (const u of winners) statusByUid[u.uid] = "winner";
  for (const u of qualRunners) statusByUid[u.uid] = "runnerup";
  if (wildcardPool[0]) statusByUid[wildcardPool[0].uid] = "wildcard";

  const wildcardRace = wildcardPool.map((u) => ({
    user: u,
    score: scores[u.uid],
    points: scores[u.uid]?.total ?? 0,
    group: u.friendGroup,
  }));

  return { statusByUid, wildcardRace };
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
 * Build rank-by-game series. Lower rank = better (1 = first place). The X axis
 * is the game number (starting at game 1); each row ranks players by their
 * cumulative total after that game.
 */
export function buildRankSeries(
  users: UserProfile[],
  scores: Record<string, ScoreDoc>,
): ChartSeries {
  const games = new Set<number>();
  for (const u of users) {
    for (const h of (scores[u.uid]?.history ?? [])) games.add(h.game);
  }
  const gameOrder = [...games].sort((a, b) => a - b);

  const lastTotals: Record<string, number> = {};

  const data = gameOrder.map((game) => {
    // Update running totals as of this game
    for (const u of users) {
      const hit = scores[u.uid]?.history.find((h) => h.game === game);
      if (hit) lastTotals[u.uid] = hit.total;
    }
    // Rank at this game
    const sorted = [...users].sort((a, b) => (lastTotals[b.uid] ?? 0) - (lastTotals[a.uid] ?? 0));
    const row: Record<string, string | number> = { game };
    sorted.forEach((u, i) => { row[u.teamName] = i + 1; });
    return row;
  });

  return { data, keys: users.map((u) => u.teamName) };
}

export interface ProjectionRow {
  uid: string;
  teamName: string;
  logoUrl?: string;
  current: number;
  projectedGain: number;
  projectedTotal: number;
  projectedRank: number;
  qualified: boolean;
}

/**
 * Project each player's final score based on their points-per-match rate.
 * Input rows are a single friend-group (already ranked by current score).
 * Returns the same players sorted by projected total descending, top 2 marked as qualifying.
 */
export function buildProjectionRows(
  rows: RankedRow[],
  playedMatchCount: number,
  totalMatchCount: number,
): ProjectionRow[] {
  const remaining = Math.max(0, totalMatchCount - playedMatchCount);

  const projected = rows.map((r): ProjectionRow => {
    const ppm = playedMatchCount > 0 ? r.score.total / playedMatchCount : 0;
    const gain = Math.round(ppm * remaining * 10) / 10;
    return {
      uid: r.user.uid,
      teamName: r.user.teamName,
      logoUrl: r.user.logoUrl,
      current: r.score.total,
      projectedGain: gain,
      projectedTotal: r.score.total + gain,
      projectedRank: 0,
      qualified: false,
    };
  });

  projected.sort((a, b) => b.projectedTotal - a.projectedTotal);
  projected.forEach((r, i) => {
    r.projectedRank = i + 1;
    r.qualified = i < 2;
  });

  return projected;
}

/**
 * Build cumulative-points-by-game chart rows from members' score histories.
 * The X axis is the game number (1 = first completed WC game); each player's
 * total carries forward across games where they have no new point.
 */
export function buildChartSeries(
  members: { teamName: string; history: { game: number; total: number }[] }[],
): ChartSeries {
  const games = new Set<number>();
  for (const m of members) for (const h of m.history) games.add(h.game);
  const gameOrder = [...games].sort((a, b) => a - b);

  const last: Record<string, number> = {};
  const data = gameOrder.map((game) => {
    const row: Record<string, number | string> = { game };
    for (const m of members) {
      const hit = m.history.find((h) => h.game === game);
      if (hit) last[m.teamName] = hit.total;
      row[m.teamName] = last[m.teamName] ?? 0;
    }
    return row;
  });
  return { data, keys: members.map((m) => m.teamName) };
}
