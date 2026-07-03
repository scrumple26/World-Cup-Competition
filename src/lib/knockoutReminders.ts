/**
 * Pure planner for the knockout-stage reminder emails.
 *
 * Two emails go out per friends' bracket round, both to the players who are
 * "still in the contest" (survivors of the head-to-head bracket) only:
 *
 *   1. Round-open  — fires once, when that round's WC fixtures publish and the
 *      round's survivors are known. "Your <stage> is live — make your picks."
 *   2. 2h reminder — fires once, ~2 hours before the round's first WC game, to
 *      survivors who still haven't submitted their picks for the round.
 *
 * This module holds no I/O: the route loads the bracket + fixture + prediction
 * state from Firestore, hands it here, and this decides exactly what to send.
 * Keeping it pure is what makes the whole flow unit-testable without Firebase.
 */

import {
  survivorsForRound,
  type Bracket,
  type BracketTeam,
  type FriendBracketRound,
} from "./bracket";

export type { FriendBracketRound } from "./bracket";

export const KO_REMINDER_ROUNDS: FriendBracketRound[] = ["r1", "sf", "final"];

/** Default lead time for the "picks close soon" nudge: 2 hours before kickoff. */
export const REMIND_LEAD_MS = 2 * 60 * 60 * 1000;

/**
 * Player-facing copy for each round: the head-to-head stage the survivor is
 * playing, and the WC round(s) they're predicting to decide it.
 */
export const ROUND_META: Record<
  FriendBracketRound,
  { stage: string; picks: string }
> = {
  r1: { stage: "Quarter-Final", picks: "World Cup Round of 32" },
  sf: { stage: "Semi-Final", picks: "World Cup Round of 16" },
  final: {
    stage: "Final",
    picks: "World Cup Quarter-Finals, Semi-Finals & Final",
  },
};

/** Per-round record of what has already been sent (persisted by the route). */
export interface KnockoutReminderState {
  open?: Partial<Record<FriendBracketRound, unknown>>;
  remind2h?: Partial<Record<FriendBracketRound, unknown>>;
}

export interface KnockoutReminderInput {
  now: number;
  /** The competition has reached the knockout stage. */
  started: boolean;
  /** Bracket built with winners of *completed* rounds resolved. */
  bracket: Bracket;
  /** Count of published WC fixtures for each round (0 = round not open yet). */
  openFixtureCount: Record<FriendBracketRound, number>;
  /** Kickoff (ms) of the earliest WC fixture in each round, or null if unknown. */
  firstKickoff: Record<FriendBracketRound, number | null>;
  /**
   * Survivors of each round who have NOT submitted their picks for that round's
   * open fixtures. The route only needs to populate this for a round whose 2h
   * window is currently open; others may be empty.
   */
  unsubmittedByRound: Record<FriendBracketRound, string[]>;
  state: KnockoutReminderState;
  remindLeadMs?: number;
}

export interface KnockoutReminderPlan {
  /** Round-open emails to send: recipient uids per round. */
  open: Array<{ round: FriendBracketRound; uids: string[] }>;
  /** 2h reminder emails to send: recipient uids per round (may be empty). */
  remind: Array<{ round: FriendBracketRound; uids: string[] }>;
  /** Why each round did nothing this run — for observability / dry runs. */
  skipped: Array<{ round: FriendBracketRound; kind: "open" | "remind2h"; reason: string }>;
}

function emptyPlan(): KnockoutReminderPlan {
  return { open: [], remind: [], skipped: [] };
}

/**
 * Decide which knockout reminder emails are due right now. Pure and idempotent:
 * feeding the same state back in produces no duplicate sends (each phase is
 * gated on its own `state` flag, which the route sets after a successful send).
 */
export function decideKnockoutReminders(
  input: KnockoutReminderInput,
): KnockoutReminderPlan {
  const plan = emptyPlan();
  if (!input.started) return plan;

  const lead = input.remindLeadMs ?? REMIND_LEAD_MS;
  const openSent = input.state.open ?? {};
  const remindSent = input.state.remind2h ?? {};

  for (const round of KO_REMINDER_ROUNDS) {
    const { ready, teams } = survivorsForRound(input.bracket, round);
    const open = input.openFixtureCount[round] ?? 0;
    const kickoff = input.firstKickoff[round] ?? null;

    // ---- Round-open announcement ----
    if (openSent[round]) {
      plan.skipped.push({ round, kind: "open", reason: "already-sent" });
    } else if (open === 0) {
      plan.skipped.push({ round, kind: "open", reason: "not-published" });
    } else if (kickoff !== null && input.now >= kickoff) {
      // The round's first game has already kicked off — picks are locking/locked,
      // so a "picks are open" announcement is stale. Also what makes deploying
      // mid-tournament safe: we never blast an alert about a round in progress.
      plan.skipped.push({ round, kind: "open", reason: "past-kickoff" });
    } else if (!ready) {
      // Fixtures are up but we can't yet name the survivors (prior round still
      // undecided) — hold the email until the bracket resolves.
      plan.skipped.push({ round, kind: "open", reason: "survivors-unknown" });
    } else {
      plan.open.push({ round, uids: uidsOf(teams) });
    }

    // ---- 2-hours-to-kickoff reminder ----
    if (remindSent[round]) {
      plan.skipped.push({ round, kind: "remind2h", reason: "already-sent" });
    } else if (!ready) {
      plan.skipped.push({ round, kind: "remind2h", reason: "survivors-unknown" });
    } else if (kickoff === null) {
      plan.skipped.push({ round, kind: "remind2h", reason: "no-kickoff" });
    } else if (input.now < kickoff - lead) {
      plan.skipped.push({ round, kind: "remind2h", reason: "too-early" });
    } else if (input.now >= kickoff) {
      plan.skipped.push({ round, kind: "remind2h", reason: "past-kickoff" });
    } else {
      // Inside the [kickoff - lead, kickoff) window: nudge only survivors who
      // still haven't submitted. Sending to an empty list is fine — the route
      // still marks the phase sent so we don't re-evaluate it next tick.
      plan.remind.push({ round, uids: input.unsubmittedByRound[round] ?? [] });
    }
  }

  return plan;
}

function uidsOf(teams: BracketTeam[]): string[] {
  return teams.map((t) => t.uid);
}
