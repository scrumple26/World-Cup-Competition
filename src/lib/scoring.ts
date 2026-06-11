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
 *  Knockout seeding tiebreak: groupPts -> perfectScores -> perfectGroups -> coin flip.
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
  /** For knockout matches: the user's explicit winner pick when they predicted a draw. */
  predictedWinner?: Outcome,
): MatchScoreBreakdown {
  const homeExact = pred.home === actual.home ? POINTS.exactSide : 0;
  const awayExact = pred.away === actual.away ? POINTS.exactSide : 0;
  const perfect = homeExact > 0 && awayExact > 0;
  const perfectBonus = perfect ? POINTS.perfectBonus : 0;

  // Use the explicit winner pick if the user predicted a draw AND a winner was set.
  const derivedPredOutcome = outcomeOf(pred.home, pred.away);
  const predOutcome =
    derivedPredOutcome === "draw" && predictedWinner
      ? predictedWinner
      : derivedPredOutcome;
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
 * Deterministic hash of a string → non-negative integer.
 * Used internally by coinFlip.
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
 * Coin flip tiebreaker for two players.
 *
 * Deterministic and stable: the "winner" is whoever has the higher UID hash,
 * giving each pair a fixed but unpredictable result that is consistent regardless
 * of the order the two players happen to be compared.
 *
 * Returns true if player A "wins" the flip (i.e. A should rank higher).
 * Used when all point-based tiebreakers are exhausted.
 */
export function coinFlip(uidA: string, uidB: string): boolean {
  return hashUid(uidA) > hashUid(uidB);
}

/**
 * Comparator ranking standings best-first:
 *   higher groupPoints → more perfectScores → more perfectGroups → coin flip.
 */
export function compareStanding(a: StandingStats, b: StandingStats): number {
  if (b.groupPoints !== a.groupPoints) return b.groupPoints - a.groupPoints;
  if (b.perfectScores !== a.perfectScores) return b.perfectScores - a.perfectScores;
  if (b.perfectGroups !== a.perfectGroups) return b.perfectGroups - a.perfectGroups;
  // All tiebreakers exhausted — coin flip.
  return coinFlip(a.uid, b.uid) ? -1 : 1;
}

/** Sort a copy of the standings best-first. */
export function rankStandings<T extends StandingStats>(rows: T[]): T[] {
  return [...rows].sort(compareStanding);
}

/**
 * Seed the 8-team knockout from the friend groups:
 *   • Seeds 1–4: the four GROUP WINNERS (1st in each group), ranked by points.
 *   • Seeds 5–7: the three best GROUP RUNNERS-UP (2nd in each group), by points.
 *   • Seed 8: a WILDCARD — the highest-point team among everyone not yet
 *     qualified (the 4th runner-up, or a 3rd-place finisher who outranks them).
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

  const winners: T[] = [];     // 1st in each group
  const runnersUp: T[] = [];   // 2nd in each group
  const rest: T[] = [];        // everyone 3rd or lower
  for (const arr of Array.from(groups.values())) {
    const ranked = rankStandings<T>(arr);
    if (ranked[0]) winners.push(ranked[0]);
    if (ranked[1]) runnersUp.push(ranked[1]);
    if (ranked.length > 2) rest.push(...ranked.slice(2));
  }

  const seed1to4 = rankStandings(winners);              // group winners, by points
  const rankedRunners = rankStandings(runnersUp);
  const seed5to7 = rankedRunners.slice(0, 3);           // three best runners-up
  // Wildcard pool: the leftover runner(s)-up + everyone 3rd or lower.
  const wildcardPool = rankStandings([...rankedRunners.slice(3), ...rest]);
  const seed8 = wildcardPool.slice(0, 1);

  return [...seed1to4, ...seed5to7, ...seed8];
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
 * Higher round points wins; tie → higher cumulative; still tied → coin flip.
 * @returns the winning side
 */
export function resolveMatchup(a: MatchupSide, b: MatchupSide): MatchupSide {
  if (a.roundPoints !== b.roundPoints)
    return a.roundPoints > b.roundPoints ? a : b;
  if (a.cumulative !== b.cumulative) return a.cumulative > b.cumulative ? a : b;
  // All tiebreakers exhausted — coin flip.
  return coinFlip(a.uid, b.uid) ? a : b;
}
