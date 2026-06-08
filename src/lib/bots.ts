import "server-only";

/**
 * Fill-in ("Random Not Human FC") bot teams.
 *
 * If fewer than 16 people sign up by the lock-in deadline, the remaining roster
 * spots are filled with bot teams that make fully random predictions, so the
 * competition always runs with a full field of 16. If 16 real people sign up,
 * no bots are created.
 */

import { randomUUID } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import type {
  GroupPrediction,
  MatchPrediction,
  Outcome,
  ThirdPlacePrediction,
  UserProfile,
  WcMatch,
} from "./types";
import type { WcGroupStanding } from "./wcMap";
import { assignFriendGroup, groupCounts } from "./groups";
import { PARTICIPANT_COUNT } from "./wc";

export const BOT_TEAM_NAME = "Random Not Human FC";

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isGroupStage(round: string): boolean {
  return round.startsWith("Group Stage");
}

/**
 * Ensure the field has PARTICIPANT_COUNT (16) teams by creating random bot teams
 * for any empty spots. Idempotent and safe to call repeatedly:
 *  - does nothing once 16 real people have signed up;
 *  - tops up only as many bots as are needed to reach 16 total.
 * Each bot gets random match predictions (each side 1–5, random KO winners),
 * random group-finish orders, and random third-place picks, all locked.
 */
export async function ensureFillTeams(db: Firestore): Promise<{ created: number }> {
  const usersSnap = await db.collection("users").get();
  const users = usersSnap.docs.map((d) => d.data() as UserProfile);
  const realCount = users.filter((u) => !u.isBot).length;
  const botCount = users.filter((u) => u.isBot).length;

  // Rule: only fill in if fewer than 16 real teams signed up.
  if (realCount >= PARTICIPANT_COUNT) return { created: 0 };
  const needed = PARTICIPANT_COUNT - realCount - botCount;
  if (needed <= 0) return { created: 0 };

  const [matchSnap, standSnap] = await Promise.all([
    db.collection("wcMatches").get(),
    db.collection("wcStandings").get(),
  ]);
  const fixtures = matchSnap.docs.map((d) => d.data() as WcMatch);
  const standings = standSnap.docs.map((d) => d.data() as WcGroupStanding);

  // Running per-friend-group counts so bots stay balanced at 4 per group.
  const counts = groupCounts(users);
  const totalBotsAfter = botCount + needed;

  let created = 0;
  for (let i = 0; i < needed; i++) {
    const uid = `bot-${randomUUID()}`;
    const friendGroup = assignFriendGroup(counts);
    counts[friendGroup] = (counts[friendGroup] ?? 0) + 1;
    const n = botCount + i + 1;
    const teamName = totalBotsAfter > 1 ? `${BOT_TEAM_NAME} ${n}` : BOT_TEAM_NAME;

    const profile: UserProfile = {
      uid,
      email: "",
      firstName: "Random",
      lastName: `Bot ${n}`,
      teamName,
      friendGroup,
      isAdmin: false,
      isBot: true,
      createdAt: Date.now(),
    };
    await db.collection("users").doc(uid).set(profile);

    const predRef = db.collection("predictions").doc(uid);

    // Random match predictions: each side 1–5; random winner for any KO draw.
    const matchPreds: MatchPrediction[] = fixtures.map((m) => {
      const home = rand(1, 5);
      const away = rand(1, 5);
      const pred: MatchPrediction = {
        fixtureId: m.id,
        home,
        away,
        submittedAt: Date.now(),
        locked: true,
      };
      if (!isGroupStage(m.round) && home === away) {
        pred.predictedWinner = (Math.random() < 0.5 ? "home" : "away") as Outcome;
      }
      return pred;
    });
    for (let j = 0; j < matchPreds.length; j += 400) {
      const batch = db.batch();
      for (const p of matchPreds.slice(j, j + 400)) {
        batch.set(predRef.collection("matches").doc(String(p.fixtureId)), p);
      }
      await batch.commit();
    }

    // Random group-finish orders + random third-place picks.
    if (standings.length) {
      const thirds: number[] = [];
      const gBatch = db.batch();
      for (const g of standings) {
        const order = shuffle(g.rows.map((r) => r.teamId));
        const gp: GroupPrediction = { group: g.group, order, overridden: true };
        gBatch.set(predRef.collection("groups").doc(g.group), gp);
        if (order[2] !== undefined) thirds.push(order[2]);
      }
      await gBatch.commit();
      const tp: ThirdPlacePrediction = { advancing: shuffle(thirds).slice(0, 8) };
      await predRef.collection("meta").doc("thirdPlace").set(tp);
    }

    created++;
  }

  return { created };
}
