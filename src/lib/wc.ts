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

/** Number of best 3rd-place teams that advance to the Round of 32. */
export const THIRD_PLACE_ADVANCING = 8;
export const WC_GROUP_COUNT = 12;
