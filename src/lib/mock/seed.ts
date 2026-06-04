/**
 * Deterministic seed data for mock mode (no Firebase required).
 *
 * Covers only the "friends" side of the app — the 16 participants, their
 * group assignments, and synthetic scores/history so every screen renders.
 * Real WC fixtures/standings always come live from API-Football.
 */

import type { FriendGroup, ScoreDoc, UserProfile } from "../types";
import { ADMIN_EMAIL } from "../config";

const NAMES: { teamName: string; first: string; last: string }[] = [
  { teamName: "Galaxy Strikers",    first: "Nolan",    last: "Leyse" },
  { teamName: "Thunder Boots",      first: "Marcus",   last: "Tanner" },
  { teamName: "Net Rippers",        first: "Sofia",    last: "Reyes" },
  { teamName: "Offside Kings",      first: "Liam",     last: "Park" },
  { teamName: "Golden Goals",       first: "Emma",     last: "Howell" },
  { teamName: "Tiki Taka Tacos",    first: "Diego",    last: "Vargas" },
  { teamName: "The Hand of Pod",    first: "Grace",    last: "Nguyen" },
  { teamName: "Counter Attackers",  first: "Noah",     last: "Briggs" },
  { teamName: "Pitch Perfect",      first: "Ava",      last: "Marsh" },
  { teamName: "Last Minute Heroes", first: "Ethan",    last: "Cole" },
  { teamName: "Group of Death",     first: "Mia",      last: "Santos" },
  { teamName: "Extra Time Crew",    first: "Lucas",    last: "Ford" },
  { teamName: "Penalty Box Pros",   first: "Olivia",   last: "Burns" },
  { teamName: "Stoppage Time",      first: "James",    last: "Quinn" },
  { teamName: "Total Football",     first: "Isabella", last: "Stone" },
  { teamName: "VAR Wars",           first: "Benjamin", last: "Hart" },
];

const GROUPS: FriendGroup[] = ["A", "B", "C", "D"];

/** 16 seed participants, 4 per friend-group, admin = configured email. */
export const SEED_USERS: UserProfile[] = NAMES.map((n, i) => {
  const isAdmin = i === 0;
  const email = isAdmin ? ADMIN_EMAIL : `${n.first}@example.com`;
  return {
    uid: `seed-${i + 1}`,
    email,
    firstName: n.first,
    lastName: n.last,
    teamName: n.teamName,
    friendGroup: GROUPS[i % 4],
    isAdmin,
    createdAt: 1_748_000_000_000 + i * 1000,
  };
});

/** Small deterministic LCG so charts are stable across reloads. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const MATCHDAYS = ["Jun 11", "Jun 14", "Jun 17", "Jun 20", "Jun 24", "Jun 27"];

/** Synthetic but deterministic per-user scores + cumulative history. */
export const SEED_SCORES: Record<string, ScoreDoc> = Object.fromEntries(
  SEED_USERS.map((u, i) => {
    const rng = lcg(i + 7);
    let running = 0;
    const history = MATCHDAYS.map((d) => {
      running += Math.round(rng() * 9 * 10) / 10; // up to ~9 pts per matchday
      return { date: d, total: Math.round(running * 10) / 10 };
    });
    const groupPts = history[history.length - 1].total;
    return [
      u.uid,
      {
        uid: u.uid,
        groupPts,
        knockoutPts: 0,
        total: groupPts,
        perfectScores: Math.floor(rng() * 5),
        perfectGroups: Math.floor(rng() * 2),
        history,
      } satisfies ScoreDoc,
    ];
  }),
);
