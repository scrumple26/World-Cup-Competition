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
  playedMatchCount: number;
  totalMatchCount: number;
}

export async function loadLeague(): Promise<LeagueData> {
  if (USE_MOCK) {
    const users = getAllUsers();
    const scores: Record<string, ScoreDoc> = {};
    for (const u of users) scores[u.uid] = SEED_SCORES[u.uid] ?? zeroScore(u.uid);
    return { users, scores, playedMatchCount: 0, totalMatchCount: 104 };
  }

  const res = await fetch("/api/league");
  if (!res.ok) return { users: [], scores: {}, playedMatchCount: 0, totalMatchCount: 104 };
  return res.json() as Promise<LeagueData>;
}
