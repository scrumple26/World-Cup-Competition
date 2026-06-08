/**
 * Pure per-user score computation from actual results + a user's predictions.
 * Used by the server recompute job; kept pure so it is unit-tested directly.
 */

import { scoreMatch, scoreGroupFinish, scoreThirdPlace } from "./scoring";
import type { MatchPrediction, Outcome } from "./types";

export interface ActualMatch {
  id: number;
  isGroupStage: boolean;
  home: number;
  away: number;
  /** Knockout winner override (penalties/ET) when the scoreline is level. */
  decidedWinner?: Outcome;
}

export interface ActualData {
  /** Played matches with final results. */
  matches: ActualMatch[];
  /** Final finishing order (teamIds, 1st→4th) for groups that are COMPLETE. */
  completedGroupOrders: Record<string, number[]>;
  /** The 8 advancing third-place teams, once the group stage is complete (else null). */
  thirdAdvancing: number[] | null;
}

export interface UserPredictions {
  matches: Record<number, MatchPrediction>;
  groupOrders: Record<string, number[]>;
  thirdAdvancing: number[];
}

export interface UserScore {
  groupPts: number;
  knockoutPts: number;
  total: number;
  perfectScores: number;
  perfectGroups: number;
  outcomesCorrect: number;
  outcomesTotal: number;
  partialScoreCorrect: number;
}

export function computeUserScore(
  actual: ActualData,
  preds: UserPredictions,
): UserScore {
  let groupPts = 0;
  let knockoutPts = 0;
  let perfectScores = 0;
  let perfectGroups = 0;
  let outcomesCorrect = 0;
  let outcomesTotal = 0;
  let partialScoreCorrect = 0;

  // 1. Match results (group + knockout share the same scoring)
  for (const m of actual.matches) {
    const p = preds.matches[m.id];
    if (!p) continue;
    const b = scoreMatch(
      { home: p.home, away: p.away },
      { home: m.home, away: m.away },
      m.decidedWinner,
      p.predictedWinner,
    );
    if (m.isGroupStage) groupPts += b.total;
    else knockoutPts += b.total;
    if (b.perfect) perfectScores++;
    outcomesTotal++;
    if (b.outcome > 0) outcomesCorrect++;
    if (p.home === m.home || p.away === m.away) partialScoreCorrect++;
  }

  // 2. Group finishes (only for completed groups)
  for (const [group, actualOrder] of Object.entries(actual.completedGroupOrders)) {
    const predOrder = preds.groupOrders[group];
    if (!predOrder) continue;
    const b = scoreGroupFinish(predOrder, actualOrder);
    groupPts += b.total;
    if (b.perfect) perfectGroups++;
  }

  // 3. Third-place advancers (only once the group stage is complete)
  if (actual.thirdAdvancing) {
    groupPts += scoreThirdPlace(preds.thirdAdvancing, actual.thirdAdvancing).total;
  }

  return {
    groupPts,
    knockoutPts,
    total: groupPts + knockoutPts,
    perfectScores,
    perfectGroups,
    outcomesCorrect,
    outcomesTotal,
    partialScoreCorrect,
  };
}
