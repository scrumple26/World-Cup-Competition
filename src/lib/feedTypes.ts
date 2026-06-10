/** Types for the per-match activity feed stored in Firestore. */

export interface PerUserMatchResult {
  uid: string;
  teamName: string;
  logoUrl?: string;
  pts: number;
  perfect: boolean;
  outcomeCorrect: boolean;
  predictedHome: number;
  predictedAway: number;
}

export interface FeedLateDrama {
  elapsed: number;
  scoringTeam: string;
  /** Players who had the exact score right at 84' but lost it due to this goal. */
  lostPerfect: string[];
  /** Players who gained the exact score due to this goal. */
  gainedPerfect: string[];
  /** Players who had the correct outcome at 84' but lost it. */
  lostOutcome: string[];
  /** Players who gained the correct outcome due to this goal. */
  gainedOutcome: string[];
  /** A VAR decision was involved in the late swing. */
  varInvolved?: boolean;
}

/** The three pundit personas. */
export type PunditSpeaker = "dempsey" | "howard" | "donovan";

/** One turn of pundit-desk dialogue. */
export interface PunditLine {
  speaker: PunditSpeaker;
  text: string;
}

/** A goal scorer, for commentary on a player's impact. */
export interface MatchScorer {
  side: "home" | "away";
  player: string;
  minute: number;
  kind: "goal" | "owngoal" | "penalty";
}

/** A free-form post authored by the admin (text and/or image). */
export interface FeedPost {
  id: string;
  text: string;
  imageUrl?: string;
  authorUid: string;
  authorName: string;
  createdAt: string; // ISO
}

export interface FeedEntry {
  fixtureId: number;
  kickoff: string; // ISO
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  homeScore: number;
  awayScore: number;
  /** Sorted by pts desc. */
  perUser: PerUserMatchResult[];
  lateDrama?: FeedLateDrama;
  createdAt: string; // ISO
}
