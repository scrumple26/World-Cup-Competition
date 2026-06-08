import "server-only";

import type { Firestore, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import type { WcMatch, MatchPrediction, UserProfile } from "./types";
import { scoreMatch, outcomeOf } from "./scoring";
import { getMatchEvents } from "./apiFootball";
import type { FeedEntry, PerUserMatchResult, FeedLateDrama } from "./feedTypes";

function reconstructScore(
  events: Awaited<ReturnType<typeof getMatchEvents>>,
  homeTeamId: number,
  awayTeamId: number,
  upToElapsed: number,
): { home: number; away: number } {
  let home = 0, away = 0;
  for (const e of events) {
    if (e.type !== "Goal" || e.detail === "Missed Penalty") continue;
    const elapsed = e.time.elapsed + (e.time.extra ?? 0);
    if (elapsed > upToElapsed) continue;
    const isHomeTeam = e.team.id === homeTeamId;
    const isOwnGoal = e.detail === "Own Goal";
    if ((isHomeTeam && !isOwnGoal) || (!isHomeTeam && isOwnGoal)) home++;
    else away++;
  }
  return { home, away };
}

async function detectLateDrama(
  match: WcMatch,
  perUser: PerUserMatchResult[],
): Promise<FeedLateDrama | undefined> {
  try {
    const events = await getMatchEvents(match.id);
    const goals = events.filter(
      (e) => e.type === "Goal" && e.detail !== "Missed Penalty",
    );
    const lateGoals = goals.filter(
      (g) => g.time.elapsed + (g.time.extra ?? 0) >= 85,
    );
    if (lateGoals.length === 0) return undefined;

    const scoreAt84 = reconstructScore(events, match.homeTeamId, match.awayTeamId, 84);
    const at84Outcome = outcomeOf(scoreAt84.home, scoreAt84.away);

    const lostPerfect: string[] = [];
    const gainedPerfect: string[] = [];
    const lostOutcome: string[] = [];
    const gainedOutcome: string[] = [];

    for (const u of perUser) {
      const hadPerfect = u.predictedHome === scoreAt84.home && u.predictedAway === scoreAt84.away;
      const hasPerfect = u.perfect;
      const hadOutcome = outcomeOf(u.predictedHome, u.predictedAway) === at84Outcome;
      const hasOutcome = u.outcomeCorrect;

      if (hadPerfect && !hasPerfect) lostPerfect.push(u.teamName);
      if (!hadPerfect && hasPerfect) gainedPerfect.push(u.teamName);
      if (hadOutcome && !hasOutcome) lostOutcome.push(u.teamName);
      if (!hadOutcome && hasOutcome) gainedOutcome.push(u.teamName);
    }

    const lastLate = lateGoals[lateGoals.length - 1];
    return {
      elapsed: lastLate.time.elapsed,
      scoringTeam: lastLate.team.name,
      lostPerfect,
      gainedPerfect,
      lostOutcome,
      gainedOutcome,
    };
  } catch {
    return undefined;
  }
}

/**
 * For each newly-completed match, build and store a FeedEntry in Firestore.
 * Called from the sync route after scoring completes.
 */
export async function generateFeedEntries(
  db: Firestore,
  newlyCompleted: WcMatch[],
  usersSnap: { docs: QueryDocumentSnapshot<DocumentData>[] },
): Promise<number> {
  if (newlyCompleted.length === 0) return 0;

  const userProfiles = new Map<string, UserProfile>();
  for (const d of usersSnap.docs) {
    const u = d.data() as UserProfile;
    userProfiles.set(u.uid, u);
  }

  let count = 0;
  for (const match of newlyCompleted) {
    if (match.goals.home === null || match.goals.away === null) continue;

    const perUser: PerUserMatchResult[] = [];

    for (const [uid, profile] of userProfiles) {
      const predSnap = await db
        .collection("predictions")
        .doc(uid)
        .collection("matches")
        .doc(String(match.id))
        .get();
      if (!predSnap.exists) continue;

      const p = predSnap.data() as MatchPrediction;
      const b = scoreMatch(
        { home: p.home, away: p.away },
        { home: match.goals.home, away: match.goals.away },
        match.decidedWinner,
        p.predictedWinner,
      );

      perUser.push({
        uid,
        teamName: profile.teamName,
        logoUrl: profile.logoUrl,
        pts: b.total,
        perfect: b.perfect,
        outcomeCorrect: b.outcome > 0,
        predictedHome: p.home,
        predictedAway: p.away,
      });
    }

    perUser.sort((a, b) => b.pts - a.pts);

    const lateDrama = await detectLateDrama(match, perUser);

    const entry: FeedEntry = {
      fixtureId: match.id,
      kickoff: match.kickoff,
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      homeLogo: match.homeLogo,
      awayLogo: match.awayLogo,
      homeScore: match.goals.home,
      awayScore: match.goals.away,
      perUser,
      ...(lateDrama ? { lateDrama } : {}),
      createdAt: new Date().toISOString(),
    };

    await db.collection("feedEntries").doc(String(match.id)).set(entry);
    count++;
  }

  return count;
}
