"use client";

/** Unified read of users + scores for standings/leaderboard/chart (mock or Firebase). */

import { USE_MOCK } from "./config";
import type { ScoreDoc, UserProfile } from "./types";
import { getAllUsers } from "./mock/store";
import { SEED_SCORES } from "./mock/seed";

function zeroScore(uid: string): ScoreDoc {
  return {
    uid,
    groupPts: 0,
    knockoutPts: 0,
    total: 0,
    perfectScores: 0,
    perfectGroups: 0,
    history: [],
  };
}

export interface LeagueData {
  users: UserProfile[];
  scores: Record<string, ScoreDoc>;
}

export async function loadLeague(): Promise<LeagueData> {
  if (USE_MOCK) {
    const users = getAllUsers();
    const scores: Record<string, ScoreDoc> = {};
    for (const u of users) scores[u.uid] = SEED_SCORES[u.uid] ?? zeroScore(u.uid);
    return { users, scores };
  }

  const { getClientDb } = await import("./firebase/client");
  const { collection, getDocs } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) return { users: [], scores: {} };

  const [uSnap, sSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "scores")),
  ]);
  const users = uSnap.docs.map((d) => d.data() as UserProfile);
  const scores: Record<string, ScoreDoc> = {};
  sSnap.forEach((d) => {
    const s = d.data() as ScoreDoc;
    scores[s.uid] = s;
  });
  for (const u of users) if (!scores[u.uid]) scores[u.uid] = zeroScore(u.uid);
  return { users, scores };
}
