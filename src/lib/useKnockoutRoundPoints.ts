"use client";

import { useEffect, useRef, useState } from "react";
import { useWcData } from "./useWcData";
import { scoreMatch } from "./scoring";
import { competitionStage, FRIEND_STAGE_WC_ROUNDS } from "./wc";
import { isPlayed } from "./wcMap";
import type { Outcome, WcMatch } from "./types";

/** Friends' bracket rounds, matching the keys used by buildBracket(). */
export type FriendRound = "r1" | "sf" | "final";
export const FRIEND_ROUNDS: FriendRound[] = ["r1", "sf", "final"];

/** Which real-WC rounds each friends' bracket round is scored from. */
const ROUND_WC: Record<FriendRound, readonly string[]> = {
  r1: FRIEND_STAGE_WC_ROUNDS.ko1,
  sf: FRIEND_STAGE_WC_ROUNDS.ko2,
  final: FRIEND_STAGE_WC_ROUNDS.kofinal,
};

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);
const DONE_STATUSES = new Set(["FT", "AET", "PEN"]);

type PredsByUid = Record<
  string,
  Record<number, { home: number; away: number; predictedWinner?: Outcome }>
>;

export interface KnockoutRoundPoints {
  /** The competition has reached the knockout stage. */
  started: boolean;
  /** Any knockout fixture is currently in progress. */
  liveActive: boolean;
  /** points[round][uid] — points earned on that round's WC matches (played + live). */
  points: Record<FriendRound, Record<string, number>>;
  /** Round has at least one WC fixture that has kicked off (live or finished). */
  roundActive: Record<FriendRound, boolean>;
  /** Every WC fixture in the round is finished — the winner can be locked in. */
  roundComplete: Record<FriendRound, boolean>;
}

const EMPTY_BY_ROUND = () => ({ r1: {}, sf: {}, final: {} });
const EMPTY_FLAGS = () => ({ r1: false, sf: false, final: false });

const EMPTY: KnockoutRoundPoints = {
  started: false,
  liveActive: false,
  points: EMPTY_BY_ROUND(),
  roundActive: EMPTY_FLAGS(),
  roundComplete: EMPTY_FLAGS(),
};

/** Score one player's prediction against a fixture's current scoreline. */
function pointsFor(
  pred: { home: number; away: number; predictedWinner?: Outcome } | undefined,
  m: WcMatch,
): number {
  if (!pred || m.goals.home == null || m.goals.away == null) return 0;
  return scoreMatch(
    { home: pred.home, away: pred.away },
    { home: m.goals.home, away: m.goals.away },
    m.decidedWinner,
    pred.predictedWinner,
  ).total;
}

/**
 * Live, per-round head-to-head points for the friends' knockout bracket.
 *
 * For each bracket round (r1/sf/final) we sum every player's prediction points
 * against the corresponding WC knockout fixtures — counting finished games and,
 * minute-by-minute, any in-progress ones. This is what turns the bracket from a
 * static seed projection into a living scoreboard once the knockout begins.
 *
 * Predictions are immutable after kickoff, so each round's pick set is fetched
 * once; only the (cheap, no-Firestore) live scores are polled.
 */
export function useKnockoutRoundPoints(): KnockoutRoundPoints {
  const { data: wc } = useWcData();
  const [state, setState] = useState<KnockoutRoundPoints>(EMPTY);
  const predsRef = useRef<{ key: string; preds: PredsByUid } | null>(null);

  useEffect(() => {
    if (!wc) return;

    const started = competitionStage(wc.fixtures) === "knockout";
    if (!started) {
      setState(EMPTY);
      return;
    }

    // Group the published KO fixtures by friends' bracket round.
    const fixturesByRound: Record<FriendRound, WcMatch[]> = {
      r1: [],
      sf: [],
      final: [],
    };
    for (const m of wc.fixtures) {
      for (const r of FRIEND_ROUNDS) {
        if (ROUND_WC[r].includes(m.round)) fixturesByRound[r].push(m);
      }
    }

    const allKoIds = FRIEND_ROUNDS.flatMap((r) => fixturesByRound[r].map((m) => m.id));
    if (allKoIds.length === 0) {
      setState({ ...EMPTY, started: true });
      return;
    }

    let active = true;
    const key = [...allKoIds].sort((a, b) => a - b).join(",");

    // Every player's picks for the KO fixtures — fetched once per fixture set.
    // by-fixtures caps at 30 ids, so request one round at a time and merge.
    async function loadPreds(): Promise<PredsByUid> {
      if (predsRef.current?.key === key) return predsRef.current.preds;
      const merged: PredsByUid = {};
      await Promise.all(
        FRIEND_ROUNDS.map(async (r) => {
          const ids = fixturesByRound[r].map((m) => m.id);
          if (ids.length === 0) return;
          try {
            const res = await fetch(`/api/predictions/by-fixtures?ids=${ids.join(",")}`);
            const d = (await res.json()) as { preds?: PredsByUid };
            for (const [uid, byFid] of Object.entries(d.preds ?? {})) {
              Object.assign((merged[uid] ??= {}), byFid);
            }
          } catch {
            /* leave this round's picks empty on failure */
          }
        }),
      );
      predsRef.current = { key, preds: merged };
      return merged;
    }

    // Live scores for KO fixtures that haven't reached a final status yet.
    async function loadLive(): Promise<Map<number, WcMatch>> {
      const pendingIds = wc!.fixtures
        .filter((m) => allKoIds.includes(m.id) && !DONE_STATUSES.has(m.status))
        .map((m) => m.id);
      const byId = new Map<number, WcMatch>();
      // Poll in chunks — /api/wc/live caps at 20 ids per call.
      for (let i = 0; i < pendingIds.length; i += 20) {
        const chunk = pendingIds.slice(i, i + 20);
        if (chunk.length === 0) continue;
        try {
          const res = await fetch(`/api/wc/live?ids=${chunk.join(",")}`);
          const d = (await res.json()) as { matches?: WcMatch[] };
          for (const m of d.matches ?? []) byId.set(m.id, m);
        } catch {
          /* keep going with whatever we have */
        }
      }
      return byId;
    }

    async function poll() {
      const [preds, live] = await Promise.all([loadPreds(), loadLive()]);
      if (!active) return;

      // Current scoreline per fixture: the freshly-polled live value if any,
      // otherwise the (already final) fixture from the cached session load.
      const resolved = (m: WcMatch): WcMatch => live.get(m.id) ?? m;

      const points = EMPTY_BY_ROUND() as Record<FriendRound, Record<string, number>>;
      const roundActive = EMPTY_FLAGS() as Record<FriendRound, boolean>;
      const roundComplete = EMPTY_FLAGS() as Record<FriendRound, boolean>;
      let liveActive = false;

      for (const r of FRIEND_ROUNDS) {
        const fixtures = fixturesByRound[r].map(resolved);
        if (fixtures.length === 0) continue;

        roundComplete[r] = fixtures.every((m) => DONE_STATUSES.has(m.status));
        roundActive[r] = fixtures.some(
          (m) => DONE_STATUSES.has(m.status) || LIVE_STATUSES.has(m.status),
        );
        if (fixtures.some((m) => LIVE_STATUSES.has(m.status))) liveActive = true;

        for (const [uid, byFid] of Object.entries(preds)) {
          let sum = 0;
          for (const m of fixtures) {
            if (isPlayed(m) || LIVE_STATUSES.has(m.status)) sum += pointsFor(byFid[m.id], m);
          }
          if (sum !== 0) points[r][uid] = sum;
        }
      }

      setState({ started: true, liveActive, points, roundActive, roundComplete });
    }

    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      active = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wc]);

  return state;
}
