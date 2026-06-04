/** Shared domain types for the World Cup Competition app. */

import type { FriendGroup } from "./wc";

export type { FriendGroup };

/** A registered participant. */
export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  teamName: string;
  logoUrl?: string;
  friendGroup: FriendGroup;
  isAdmin: boolean;
  createdAt: number;
}

/** Returns "First L." display format, e.g. "Nolan L." */
export function displayName(profile: Pick<UserProfile, "firstName" | "lastName">): string {
  const last = profile.lastName.trim();
  return `${profile.firstName.trim()} ${last.charAt(0).toUpperCase()}.`;
}

/** Match outcome from the home team's perspective. */
export type Outcome = "home" | "draw" | "away";

/** A predicted or actual scoreline. */
export interface ScoreLine {
  home: number;
  away: number;
}

/** A cached WC fixture (subset stored in Firestore). */
export interface WcMatch {
  id: number;
  round: string;
  kickoff: string; // ISO
  status: string; // API short status, e.g. "NS", "FT"
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeLogo: string;
  awayLogo: string;
  /** Final goals (regulation/result line) once played; null until then. */
  goals: { home: number | null; away: number | null };
  /** Knockout advancement (set if decided by ET/penalties). */
  decidedWinner?: Outcome;
  /** True if an admin manually set the result; sync must not overwrite. */
  manualOverride?: boolean;
}

/** A user's prediction for a single match. */
export interface MatchPrediction {
  fixtureId: number;
  home: number;
  away: number;
  submittedAt: number;
  /** Set true once locked at kickoff. */
  locked?: boolean;
}

/** A user's predicted finishing order for one WC group (teamIds, 1st→4th). */
export interface GroupPrediction {
  group: string; // "Group A"
  order: number[]; // teamIds length 4
}

/** A user's picks for which 8 third-place teams advance. */
export interface ThirdPlacePrediction {
  advancing: number[]; // teamIds, length 8
}

/** Per-user score document. */
export interface ScoreDoc {
  uid: string;
  groupPts: number;
  knockoutPts: number;
  total: number;
  /** Counters used for seeding tiebreaks. */
  perfectScores: number;
  perfectGroups: number;
  /** Time series for the cumulative chart. */
  history: { date: string; total: number }[];
}
