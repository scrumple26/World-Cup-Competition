import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { MatchPrediction, ScoreDoc, WcMatch, Outcome } from "./types";
import type { WcGroupStanding } from "./wcMap";
import {
  computeUserScore,
  type ActualData,
  type ActualMatch,
  type UserPredictions,
} from "./computeScore";

function isGroupStage(round: string): boolean {
  return round.startsWith("Group Stage");
}
function isPlayed(m: WcMatch): boolean {
  return m.goals.home !== null && m.goals.away !== null && ["FT", "AET", "PEN"].includes(m.status);
}

/** Build the actual-results snapshot used to score everyone. */
async function loadActual(db: Firestore): Promise<ActualData> {
  const [matchSnap, standSnap] = await Promise.all([
    db.collection("wcMatches").get(),
    db.collection("wcStandings").get(),
  ]);
  const allMatches = matchSnap.docs.map((d) => d.data() as WcMatch);
  const standings = standSnap.docs.map((d) => d.data() as WcGroupStanding);

  // Played matches → ActualMatch
  const matches: ActualMatch[] = allMatches.filter(isPlayed).map((m) => ({
    id: m.id,
    isGroupStage: isGroupStage(m.round),
    home: m.goals.home as number,
    away: m.goals.away as number,
    kickoff: new Date(m.kickoff).getTime(),
    decidedWinner: m.decidedWinner as Outcome | undefined,
  }));

  // Team → group membership for completion detection
  const teamGroup = new Map<number, string>();
  for (const g of standings) for (const r of g.rows) teamGroup.set(r.teamId, g.group);

  // Group → played count of its group-stage matches (6 when complete)
  const playedByGroup = new Map<string, number>();
  for (const m of allMatches) {
    if (!isGroupStage(m.round) || !isPlayed(m)) continue;
    const grp = teamGroup.get(m.homeTeamId) ?? teamGroup.get(m.awayTeamId);
    if (grp) playedByGroup.set(grp, (playedByGroup.get(grp) ?? 0) + 1);
  }

  const completedGroupOrders: Record<string, number[]> = {};
  for (const g of standings) {
    if ((playedByGroup.get(g.group) ?? 0) >= 6) {
      completedGroupOrders[g.group] = [...g.rows]
        .sort((a, b) => a.rank - b.rank)
        .map((r) => r.teamId);
    }
  }

  // Third-place advancers: only once ALL 12 groups are complete.
  // Tiebreaker order mirrors WC 2026 rules: points → GD → GF → wins.
  let thirdAdvancing: number[] | null = null;
  if (standings.length >= 12 && Object.keys(completedGroupOrders).length >= 12) {
    const thirds = standings
      .map((g) => [...g.rows].sort((a, b) => a.rank - b.rank)[2])
      .filter(Boolean);
    thirdAdvancing = thirds
      .sort((a, b) =>
        b.points - a.points ||
        b.goalsDiff - a.goalsDiff ||
        b.gf - a.gf ||
        b.win - a.win,
      )
      .slice(0, 8)
      .map((r) => r.teamId);
  }

  return { matches, completedGroupOrders, thirdAdvancing };
}

async function loadUserPredictions(
  db: Firestore,
  uid: string,
): Promise<UserPredictions> {
  const [mSnap, gSnap, tSnap, lockSnap] = await Promise.all([
    db.collection("predictions").doc(uid).collection("matches").get(),
    db.collection("predictions").doc(uid).collection("groups").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("thirdPlace").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("userLock").get(),
  ]);
  const matches: Record<number, MatchPrediction> = {};
  mSnap.forEach((d) => {
    const p = d.data() as MatchPrediction;
    matches[p.fixtureId] = p;
  });
  const groupOrders: Record<string, number[]> = {};
  gSnap.forEach((d) => {
    const g = d.data() as { group: string; order: number[] };
    groupOrders[g.group] = g.order;
  });
  const thirdAdvancing = tSnap.exists
    ? ((tSnap.data() as { advancing: number[] }).advancing ?? [])
    : [];
  // Lock-in time gates scoring: games that started before this score 0. No
  // lock doc → never locked in → no games count.
  const lockedAt = lockSnap.exists
    ? ((lockSnap.data() as { lockedAt?: number }).lockedAt ?? null)
    : null;
  return { matches, groupOrders, thirdAdvancing, lockedAt };
}

/**
 * Auto-fill is DISABLED. Policy: if you don't submit a prediction for a game
 * before it kicks off, you score 0 for that game — no randomly generated picks
 * for non-submitters. Kept as a no-op so existing callers are unaffected.
 */
export async function autoFillMissingPredictions(
  db: Firestore,
  wcMatches: WcMatch[],
): Promise<number> {
  void db; void wcMatches; // intentionally unused — auto-fill is disabled
  return 0;
}

/**
 * Recompute every user's score from cached results + their predictions,
 * persisting `scores/{uid}` and appending a daily point to the history series.
 */
export async function recomputeAllScores(db: Firestore): Promise<number> {
  const actual = await loadActual(db);
  // Batch-read all existing scores once (for history carry-forward) instead of
  // a separate read per user inside the loop.
  const [usersSnap, scoresSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("scores").get(),
  ]);
  const prevByUid = new Map<string, ScoreDoc>();
  scoresSnap.forEach((d) => prevByUid.set(d.id, d.data() as ScoreDoc));
  const today = new Date().toISOString().slice(0, 10);

  let count = 0;
  let errors = 0;
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    try {
      const preds = await loadUserPredictions(db, uid);
      const s = computeUserScore(actual, preds);

      const ref = db.collection("scores").doc(uid);
      const prev = prevByUid.get(uid);
      const history = prev?.history ? [...prev.history] : [];
      const lastIdx = history.length - 1;
      if (lastIdx >= 0 && history[lastIdx].date === today) {
        history[lastIdx] = { date: today, total: s.total };
      } else {
        history.push({ date: today, total: s.total });
      }

      const scoreDoc: ScoreDoc = {
        uid,
        groupPts: s.groupPts,
        knockoutPts: s.knockoutPts,
        total: s.total,
        perfectScores: s.perfectScores,
        perfectGroups: s.perfectGroups,
        outcomesCorrect: s.outcomesCorrect,
        outcomesTotal: s.outcomesTotal,
        partialScoreCorrect: s.partialScoreCorrect,
        history,
      };
      await ref.set(scoreDoc);
      count++;
    } catch (err) {
      // One user's failure must not block the others.
      console.error(`[recomputeAllScores] failed for uid=${uid}:`, err);
      errors++;
    }
  }
  if (errors > 0) console.warn(`[recomputeAllScores] ${errors} user(s) failed, ${count} succeeded`);
  return count;
}
