import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { UserProfile, ScoreDoc, WcMatch, MatchPrediction, Outcome } from "./types";
import {
  buildBracket,
  resolveBracketWinners,
  type Bracket,
  type SeedRow,
  type FriendBracketRound,
} from "./bracket";
import { scoreMatch } from "./scoring";
import { FRIEND_STAGE_WC_ROUNDS, competitionStage } from "./wc";
import { KO_REMINDER_ROUNDS } from "./knockoutReminders";

const DONE = new Set(["FT", "AET", "PEN"]);

/** WC round strings that feed each friends' bracket round (r1/sf/final). */
const ROUND_WC: Record<FriendBracketRound, string[]> = {
  r1: FRIEND_STAGE_WC_ROUNDS.ko1,
  sf: FRIEND_STAGE_WC_ROUNDS.ko2,
  final: FRIEND_STAGE_WC_ROUNDS.kofinal,
};

function kickoffMs(m: WcMatch): number {
  return new Date(m.kickoff).getTime();
}

/** A resolved server-side view of the knockout: bracket + fixture timing + picks. */
export interface KnockoutSnapshot {
  started: boolean;
  bracket: Bracket;
  usersByUid: Map<string, UserProfile>;
  /** WC fixtures grouped by the friends' round they belong to. */
  fixturesByRound: Record<FriendBracketRound, WcMatch[]>;
  openFixtureCount: Record<FriendBracketRound, number>;
  firstKickoff: Record<FriendBracketRound, number | null>;
  /** Every player's knockout prediction, keyed uid → fixtureId → pick. */
  predsByUid: Map<string, Map<number, MatchPrediction>>;
}

const EMPTY_BY_ROUND = <T>(v: T): Record<FriendBracketRound, T> => ({
  r1: v,
  sf: v,
  final: v,
});

/**
 * Read everything needed to reason about the knockout bracket + reminders in a
 * handful of Firestore round-trips. Returns null only when the DB is empty /
 * unconfigured; `started` is false until the competition reaches the knockout.
 */
export async function loadKnockoutSnapshot(
  db: Firestore,
): Promise<KnockoutSnapshot | null> {
  const [matchSnap, userSnap, scoreSnap] = await Promise.all([
    db.collection("wcMatches").get(),
    db.collection("users").get(),
    db.collection("scores").get(),
  ]);

  const wcMatches = matchSnap.docs.map((d) => d.data() as WcMatch);
  if (wcMatches.length === 0) return null;

  const users = userSnap.docs.map((d) => d.data() as UserProfile);
  const usersByUid = new Map(users.map((u) => [u.uid, u]));
  const scoreByUid = new Map(
    scoreSnap.docs.map((d) => [d.id, d.data() as ScoreDoc]),
  );

  // Seed rows include EVERY participant (bots too) so the bracket seeding and
  // winner resolution match exactly what the app renders. Emailing filters to
  // real players later.
  const rows: SeedRow[] = users.map((u) => {
    const s = scoreByUid.get(u.uid);
    return {
      uid: u.uid,
      teamName: u.teamName,
      friendGroup: u.friendGroup,
      groupPoints: s ? s.groupPts || s.total : 0,
      perfectScores: s?.perfectScores ?? 0,
      perfectGroups: s?.perfectGroups ?? 0,
    };
  });

  const started = competitionStage(wcMatches) === "knockout";

  // Bucket published KO fixtures by friends' round + collect their ids.
  const fixturesByRound = EMPTY_BY_ROUND<WcMatch[]>([]) as Record<
    FriendBracketRound,
    WcMatch[]
  >;
  for (const r of KO_REMINDER_ROUNDS) fixturesByRound[r] = [];
  for (const m of wcMatches) {
    for (const r of KO_REMINDER_ROUNDS) {
      if (ROUND_WC[r].includes(m.round)) fixturesByRound[r].push(m);
    }
  }

  const openFixtureCount = EMPTY_BY_ROUND(0) as Record<FriendBracketRound, number>;
  const firstKickoff = EMPTY_BY_ROUND<number | null>(null) as Record<
    FriendBracketRound,
    number | null
  >;
  for (const r of KO_REMINDER_ROUNDS) {
    const fx = fixturesByRound[r];
    openFixtureCount[r] = fx.length;
    const times = fx.map(kickoffMs).filter((t) => Number.isFinite(t));
    firstKickoff[r] = times.length ? Math.min(...times) : null;
  }

  // Fetch every player's picks for all KO fixtures in one getAll.
  const koIds = Array.from(
    new Set(KO_REMINDER_ROUNDS.flatMap((r) => fixturesByRound[r].map((m) => m.id))),
  );
  const predsByUid = await loadKnockoutPreds(db, users, koIds);

  // Per-round head-to-head points from FINAL results only, plus completion.
  const points = EMPTY_BY_ROUND<Record<string, number>>({}) as Record<
    FriendBracketRound,
    Record<string, number>
  >;
  const roundComplete = EMPTY_BY_ROUND(false) as Record<FriendBracketRound, boolean>;
  for (const r of KO_REMINDER_ROUNDS) {
    points[r] = {};
    const finished = fixturesByRound[r].filter((m) => DONE.has(m.status));
    roundComplete[r] =
      fixturesByRound[r].length > 0 &&
      fixturesByRound[r].every((m) => DONE.has(m.status));
    for (const u of users) {
      const preds = predsByUid.get(u.uid);
      if (!preds) continue;
      let sum = 0;
      for (const m of finished) {
        const p = preds.get(m.id);
        if (!p || m.goals.home == null || m.goals.away == null) continue;
        sum += scoreMatch(
          { home: p.home, away: p.away },
          { home: m.goals.home, away: m.goals.away },
          m.decidedWinner as Outcome | undefined,
          p.predictedWinner,
        ).total;
      }
      if (sum !== 0) points[r][u.uid] = sum;
    }
  }

  // Resolve winners for COMPLETED rounds only, so survivors of a later round are
  // only "known" once the round that decides them has fully finished.
  const winners = started
    ? resolveBracketWinners(rows, { points, roundActive: roundComplete })
    : {};
  const bracket = buildBracket(rows, winners);

  return {
    started,
    bracket,
    usersByUid,
    fixturesByRound,
    openFixtureCount,
    firstKickoff,
    predsByUid,
  };
}

async function loadKnockoutPreds(
  db: Firestore,
  users: UserProfile[],
  koIds: number[],
): Promise<Map<string, Map<number, MatchPrediction>>> {
  const byUid = new Map<string, Map<number, MatchPrediction>>();
  if (koIds.length === 0 || users.length === 0) return byUid;

  const refs = [];
  for (const u of users) {
    for (const id of koIds) {
      refs.push(
        db.collection("predictions").doc(u.uid).collection("matches").doc(String(id)),
      );
    }
  }
  const docs = await db.getAll(...refs);
  docs.forEach((snap, i) => {
    if (!snap.exists) return;
    const uid = users[Math.floor(i / koIds.length)].uid;
    const p = snap.data() as MatchPrediction;
    (byUid.get(uid) ?? byUid.set(uid, new Map()).get(uid)!).set(p.fixtureId, p);
  });
  return byUid;
}

/**
 * Survivors of `round` who still haven't submitted a pick for at least one of
 * that round's fixtures that is still open (kickoff in the future). These are
 * the players who'd score zero if the round started right now.
 */
export function unsubmittedForRound(
  snap: KnockoutSnapshot,
  survivorUids: string[],
  round: FriendBracketRound,
  now: number,
): string[] {
  const pickable = snap.fixturesByRound[round].filter(
    (m) => !DONE.has(m.status) && kickoffMs(m) > now,
  );
  if (pickable.length === 0) return [];

  return survivorUids.filter((uid) => {
    const preds = snap.predsByUid.get(uid);
    return pickable.some((m) => !preds || !preds.has(m.id));
  });
}
