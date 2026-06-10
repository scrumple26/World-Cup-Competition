import "server-only";

import type { Firestore, QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import type { WcMatch, MatchPrediction, UserProfile } from "./types";
import { scoreMatch, outcomeOf } from "./scoring";
import { getMatchEvents, getMatchStatistics } from "./apiFootball";
import { generatePunditCommentary, type StatLeaderLine } from "./commentary";
import type { FeedEntry, PerUserMatchResult, FeedLateDrama, MatchScorer } from "./feedTypes";

type ApiEvents = Awaited<ReturnType<typeof getMatchEvents>>;

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

function detectLateDrama(
  events: ApiEvents,
  match: WcMatch,
  perUser: PerUserMatchResult[],
): FeedLateDrama | undefined {
  const goals = events.filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
  const lateGoals = goals.filter((g) => g.time.elapsed + (g.time.extra ?? 0) >= 85);
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
  const lateMin = lastLate.time.elapsed + (lastLate.time.extra ?? 0);
  // VAR involved if a VAR event lands within ~3 minutes of the decisive late goal.
  const varInvolved = events.some(
    (e) => e.type === "Var" && Math.abs(e.time.elapsed + (e.time.extra ?? 0) - lateMin) <= 3,
  );

  return {
    elapsed: lastLate.time.elapsed,
    scoringTeam: lastLate.team.name,
    lostPerfect,
    gainedPerfect,
    lostOutcome,
    gainedOutcome,
    ...(varInvolved ? { varInvolved: true } : {}),
  };
}

function buildScorers(events: ApiEvents, homeTeamId: number): MatchScorer[] {
  return events
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .map((e) => ({
      side: e.team.id === homeTeamId ? "home" : "away",
      player: e.player.name ?? "Unknown",
      minute: e.time.elapsed + (e.time.extra ?? 0),
      kind: e.detail === "Own Goal" ? "owngoal" : e.detail.includes("Penalty") ? "penalty" : "goal",
    }));
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return Number(String(v).replace("%", "")) || 0;
}

async function buildStatLeaders(fixtureId: number, homeTeamId: number): Promise<StatLeaderLine[]> {
  try {
    const raw = await getMatchStatistics(fixtureId);
    if (raw.length < 2) return [];
    const home = raw.find((s) => s.team.id === homeTeamId)?.statistics ?? [];
    const away = raw.find((s) => s.team.id !== homeTeamId)?.statistics ?? [];
    const val = (arr: typeof home, key: string) => num(arr.find((x) => x.type === key)?.value);
    const mk = (label: string, key: string, suffix?: string): StatLeaderLine => {
      const h = val(home, key), a = val(away, key);
      return { label, home: h, away: a, leader: h > a ? "home" : a > h ? "away" : "even", suffix };
    };
    return [
      mk("Possession", "Ball Possession", "%"),
      mk("Shots", "Total Shots"),
      mk("Shots on Target", "Shots on Goal"),
      mk("Corners", "Corner Kicks"),
      mk("Pass Accuracy", "Passes %", "%"),
    ];
  } catch {
    return [];
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

    // Fetch events + stats once; reuse for drama, scorers, and commentary.
    const [events, statLeaders] = await Promise.all([
      getMatchEvents(match.id).catch(() => [] as ApiEvents),
      buildStatLeaders(match.id, match.homeTeamId),
    ]);
    const lateDrama = detectLateDrama(events, match, perUser);
    const scorers = buildScorers(events, match.homeTeamId);

    // AI pundit reaction to this match (falls back to a template without a key).
    const commentary = await generatePunditCommentary({
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      homeScore: match.goals.home,
      awayScore: match.goals.away,
      scorers,
      statLeaders,
      lateDrama,
      perfectPickers: perUser.filter((u) => u.perfect).map((u) => u.teamName),
    });

    const entry: FeedEntry = {
      fixtureId: match.id,
      kickoff: match.kickoff,
      round: match.round,
      homeTeam: match.homeTeamName,
      awayTeam: match.awayTeamName,
      homeLogo: match.homeLogo,
      awayLogo: match.awayLogo,
      homeScore: match.goals.home,
      awayScore: match.goals.away,
      perUser,
      ...(lateDrama ? { lateDrama } : {}),
      ...(scorers.length ? { scorers } : {}),
      ...(commentary.length ? { commentary } : {}),
      createdAt: new Date().toISOString(),
    };

    await db.collection("feedEntries").doc(String(match.id)).set(entry);
    count++;
  }

  return count;
}
