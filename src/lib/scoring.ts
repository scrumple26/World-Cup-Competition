/**
 * Pure scoring engine for the World Cup Competition.
 *
 * No I/O, no external deps — every function is deterministic and unit-tested.
 * Data plumbing (results, predictions) is wired in later phases; this module
 * only encodes the rules.
 *
 * Rules summary:
 *  Per match (group & knockout, identical):
 *    correct outcome (W/D/L) ............ 1
 *    exact home goals ................... 0.5
 *    exact away goals ................... 0.5
 *    both exact (perfect score) ......... +1 bonus  -> perfect = 3 total
 *  Group stage extras (per WC group):
 *    each team in correct final position. +1
 *    perfect group (all 4 correct) ...... +2 bonus
 *    each correctly picked advancing
 *      3rd-place team ................... +1
 *  Knockout seeding tiebreak: groupPts -> perfectScores -> perfectGroups -> uid hash.
 */

import type { Outcome, ScoreLine } from "./types";

export const POINTS = {
  outcome: 1,
  exactSide: 0.5,
  perfectBonus: 1,
  groupFinish: 1,
  perfectGroup: 2,
  thirdPlace: 1,
} as const;

/** Outcome of a scoreline from the home team's perspective. */
export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export interface MatchScoreBreakdown {
  outcome: number;
  homeExact: number;
  awayExact: number;
  perfectBonus: number;
  total: number;
  /** True when both goal totals were predicted exactly. */
  perfect: boolean;
}

/**
 * Score a single match prediction against the actual result.
 *
 * @param pred predicted scoreline
 * @param actual actual scoreline (the result line used for scoring)
 * @param actualOutcomeOverride optional explicit winner — used in knockout when a
 *   draw on the scoreline is decided by extra time / penalties.
 */
export function scoreMatch(
  pred: ScoreLine,
  actual: ScoreLine,
  actualOutcomeOverride?: Outcome,
): MatchScoreBreakdown {
  const homeExact = pred.home === actual.home ? POINTS.exactSide : 0;
  const awayExact = pred.away === actual.away ? POINTS.exactSide : 0;
  const perfect = homeExact > 0 && awayExact > 0;
  const perfectBonus = perfect ? POINTS.perfectBonus : 0;

  const predOutcome = outcomeOf(pred.home, pred.away);
  const actualOutcome = actualOutcomeOverride ?? outcomeOf(actual.home, actual.away);
  const outcome = predOutcome === actualOutcome ? POINTS.outcome : 0;

  return {
    outcome,
    homeExact,
    awayExact,
    perfectBonus,
    perfect,
    total: outcome + homeExact + awayExact + perfectBonus,
  };
}

export interface GroupFinishBreakdown {
  correctCount: number;
  perPositionPts: number;
  perfect: boolean;
  perfectBonus: number;
  total: number;
}

/**
 * Score a predicted group finishing order against the actual order.
 * Both arrays are teamIds in finishing order (index 0 = 1st place).
 */
export function scoreGroupFinish(
  predOrder: number[],
  actualOrder: number[],
): GroupFinishBreakdown {
  let correctCount = 0;
  for (let i = 0; i < actualOrder.length; i++) {
    if (predOrder[i] === actualOrder[i]) correctCount++;
  }
  const perPositionPts = correctCount * POINTS.groupFinish;
  const perfect = actualOrder.length > 0 && correctCount === actualOrder.length;
  const perfectBonus = perfect ? POINTS.perfectGroup : 0;
  return {
    correctCount,
    perPositionPts,
    perfect,
    perfectBonus,
    total: perPositionPts + perfectBonus,
  };
}

/**
 * Score which third-place teams a user picked to advance.
 * @param predicted teamIds the user picked (length 8)
 * @param actualAdvancing teamIds that actually advanced
 */
export function scoreThirdPlace(
  predicted: number[],
  actualAdvancing: number[],
): { correctCount: number; total: number } {
  const advancing = new Set(actualAdvancing);
  let correctCount = 0;
  for (const id of predicted) if (advancing.has(id)) correctCount++;
  return { correctCount, total: correctCount * POINTS.thirdPlace };
}

// ---------------------------------------------------------------------------
// Standings, seeding, and head-to-head resolution
// ---------------------------------------------------------------------------

/** Tiebreak inputs shared by friend-group standings and knockout seeding. */
export interface StandingStats {
  uid: string;
  groupPoints: number;
  perfectScores: number;
  perfectGroups: number;
}

/**
 * Deterministic, stable hash of a string → non-negative integer.
 * Used as the final seeding tiebreak so ordering never depends on Math.random.
 */
export function hashUid(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Comparator ranking standings best-first:
 *   higher groupPoints → more perfectScores → more perfectGroups → lower uid hash.
 */
export function compareStanding(a: StandingStats, b: StandingStats): number {
  if (b.groupPoints !== a.groupPoints) return b.groupPoints - a.groupPoints;
  if (b.perfectScores !== a.perfectScores) return b.perfectScores - a.perfectScores;
  if (b.perfectGroups !== a.perfectGroups) return b.perfectGroups - a.perfectGroups;
  return hashUid(a.uid) - hashUid(b.uid);
}

/** Sort a copy of the standings best-first. */
export function rankStandings<T extends StandingStats>(rows: T[]): T[] {
  return [...rows].sort(compareStanding);
}

/**
 * Top 2 of each friend-group qualify for the knockout (8 total),
 * then seeded 1–8 across all qualifiers by the same comparator.
 * @param byGroup map of friendGroup → that group's members' stats
 * @returns qualifiers ordered seed 1 (best) … seed 8
 */
export function seedKnockout<T extends StandingStats & { friendGroup: string }>(
  rows: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const arr = groups.get(r.friendGroup) ?? [];
    arr.push(r);
    groups.set(r.friendGroup, arr);
  }
  const qualifiers: T[] = [];
  for (const arr of Array.from(groups.values())) {
    qualifiers.push(...rankStandings<T>(arr).slice(0, 2));
  }
  return rankStandings(qualifiers);
}

/**
 * Pair seeded entrants highest-vs-lowest: [s1,sN],[s2,sN-1],...
 * For 8 seeds → [1v8, 2v7, 3v6, 4v5].
 */
export function knockoutMatchups<T>(seeded: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  const n = seeded.length;
  for (let i = 0; i < n / 2; i++) {
    pairs.push([seeded[i], seeded[n - 1 - i]]);
  }
  return pairs;
}

/** A competitor in a single head-to-head knockout matchup. */
export interface MatchupSide {
  uid: string;
  /** Points earned on this round's WC matches. */
  roundPoints: number;
  /** Cumulative total (group + knockout) for tiebreaks. */
  cumulative: number;
}

/**
 * Resolve a head-to-head knockout matchup.
 * Higher round points wins; tie → higher cumulative; still tied → lower uid hash.
 * @returns the winning side
 */
export function resolveMatchup(a: MatchupSide, b: MatchupSide): MatchupSide {
  if (a.roundPoints !== b.roundPoints)
    return a.roundPoints > b.roundPoints ? a : b;
  if (a.cumulative !== b.cumulative) return a.cumulative > b.cumulative ? a : b;
  return hashUid(a.uid) <= hashUid(b.uid) ? a : b;
}
