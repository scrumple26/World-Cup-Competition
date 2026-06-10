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

// ── Weekly "Global Football Cup Times" newspaper ──────────────────────────────

export interface WeeklyGroupTeam {
  team: string;
  logo?: string;
  rank: number;
  prevRank: number | null; // rank at the start of the week; null if no prior snapshot
  points: number;
  played: number;
}

export interface WeeklyGroup {
  group: string; // e.g. "Group A"
  teams: WeeklyGroupTeam[];
}

export interface WeeklyStatLine {
  teamName: string;
  logoUrl?: string;
  value: number;
}

/** One weekly newspaper edition, stored in the `weeklyTimes` collection. */
export interface WeeklyTimes {
  id: string;        // week-ending date YYYY-MM-DD
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  headline: string;
  subhead?: string;
  body: string[];    // AI-written newspaper paragraphs
  punditColumn: PunditLine[];
  groups: WeeklyGroup[];
  topPoints: WeeklyStatLine[];   // most points gained this week
  topPerfects: WeeklyStatLine[]; // most perfect games this week
  closeRaces: string[];          // tight races worth watching
  matchesPlayed: number;
  createdAt: string; // ISO
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
