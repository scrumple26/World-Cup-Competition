/**
 * World Cup 2026 competition constants and stage mappings.
 *
 * Verified live against API-Football (league 1, season 2026):
 *   48 teams, 12 groups (A–L), 72 group matches across 3 rounds.
 *   Knockout fixtures publish progressively after the group stage.
 */

export const WC_LEAGUE_ID = Number(process.env.WC_LEAGUE_ID ?? 1);
export const WC_SEASON = Number(process.env.WC_SEASON ?? 2026);

/** API-Football `league.round` strings for the group stage. */
export const GROUP_ROUNDS = [
  "Group Stage - 1",
  "Group Stage - 2",
  "Group Stage - 3",
] as const;

/** API-Football `league.round` strings for the knockout stage (2026 48-team format). */
export const KO_ROUNDS = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD: "3rd Place Final",
  FINAL: "Final",
} as const;

/** The friends' meta-game stages. */
export type FriendStage = "group" | "ko1" | "ko2" | "kofinal";

/**
 * Which real-WC rounds each friends' knockout round asks you to predict.
 *   ko1     -> WC Round of 32
 *   ko2     -> WC Round of 16
 *   kofinal -> WC Quarter-finals + Semi-finals + Final
 * (Predictions within a friend round unlock as each WC round's fixtures publish.)
 */
export const FRIEND_STAGE_WC_ROUNDS: Record<
  Exclude<FriendStage, "group">,
  string[]
> = {
  ko1: [KO_ROUNDS.R32],
  ko2: [KO_ROUNDS.R16],
  kofinal: [KO_ROUNDS.QF, KO_ROUNDS.SF, KO_ROUNDS.FINAL],
};

/** Friend-group labels (16 people, 4 per group). */
export const FRIEND_GROUPS = ["A", "B", "C", "D"] as const;
export type FriendGroup = (typeof FRIEND_GROUPS)[number];

export const PARTICIPANT_COUNT = 16;
export const GROUP_SIZE = 4;

/** True for API-Football group-stage round strings (e.g. "Group Stage - 1"). */
export function isGroupRound(round: string): boolean {
  return round.startsWith("Group Stage");
}

/** How much is riding on a match — drives pundit tone/intensity. */
export type MatchStakes = "normal" | "qualifier" | "knockout";

/**
 * Stakes for a match from its round:
 *  - knockout  → any non-group round (win or go home)
 *  - qualifier → the final group matchday (qualification on the line)
 *  - normal    → earlier group games
 */
export function stakesForRound(round: string): MatchStakes {
  if (!isGroupRound(round)) return "knockout";
  if (round === "Group Stage - 3") return "qualifier";
  return "normal";
}

const LIVE_STATUS = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const DONE_STATUS = new Set(["FT", "AET", "PEN"]);

/**
 * Which phase the overall competition is in, derived from fixtures.
 * Knockout once any knockout fixture has kicked off/finished, or once every
 * group-stage match is complete. Otherwise still the group phase.
 */
export function competitionStage(
  matches: { round: string; status: string }[],
): "group" | "knockout" {
  const koStarted = matches.some(
    (m) => !isGroupRound(m.round) && (LIVE_STATUS.has(m.status) || DONE_STATUS.has(m.status)),
  );
  if (koStarted) return "knockout";
  const groupMatches = matches.filter((m) => isGroupRound(m.round));
  const allGroupsDone =
    groupMatches.length > 0 && groupMatches.every((m) => DONE_STATUS.has(m.status));
  return allGroupsDone ? "knockout" : "group";
}

/** Number of best 3rd-place teams that advance to the Round of 32. */
export const THIRD_PLACE_ADVANCING = 8;
export const WC_GROUP_COUNT = 12;
