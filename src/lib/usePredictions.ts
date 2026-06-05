"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GroupPrediction,
  MatchPrediction,
  Outcome,
  ThirdPlacePrediction,
} from "./types";
import type { GroupBundle } from "./wcClient";
import type { SaveState } from "@/components/predictions/MatchPredictionCard";
import {
  loadGroupPredictions,
  loadMatchPredictions,
  loadThirdPlace,
  saveGroupPrediction,
  saveMatchPrediction,
  saveThirdPlace,
} from "./predictionsRepo";

/**
 * Loads and persists a user's predictions. Group finish orders auto-populate
 * from the current WC standings until the user reorders them.
 */
export function usePredictions(uid: string | undefined, groups: GroupBundle[]) {
  const [matches, setMatches] = useState<Record<number, MatchPrediction>>({});
  const [groupOrders, setGroupOrders] = useState<Record<string, number[]>>({});
  const [thirdPlace, setThirdPlaceState] = useState<number[]>([]);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [loaded, setLoaded] = useState(false);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Initial load
  useEffect(() => {
    if (!uid) return;
    let active = true;
    Promise.all([
      loadMatchPredictions(uid),
      loadGroupPredictions(uid),
      loadThirdPlace(uid),
    ]).then(([m, g, t]) => {
      if (!active) return;
      setMatches(m);
      const orders: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(g)) orders[k] = v.order;
      setGroupOrders(orders);
      setThirdPlaceState(t.advancing);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  // Auto-populate any missing group order from standings order (bundle.teams).
  useEffect(() => {
    if (!loaded || groups.length === 0) return;
    setGroupOrders((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of groups) {
        if (!next[g.group] || next[g.group].length !== g.teams.length) {
          next[g.group] = g.teams.map((t) => t.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loaded, groups]);

  const setMatch = useCallback(
    (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => {
      setMatches((prev) => ({
        ...prev,
        [fixtureId]: {
          ...prev[fixtureId],
          fixtureId,
          home: home ?? 0,
          away: away ?? 0,
          submittedAt: Date.now(),
          ...(predictedWinner !== undefined ? { predictedWinner } : {}),
        },
      }));
      if (home === null || away === null) return;
      if (!uid) return;
      setSaveStates((s) => ({ ...s, [fixtureId]: "saving" }));
      clearTimeout(timers.current[fixtureId]);
      timers.current[fixtureId] = setTimeout(async () => {
        await saveMatchPrediction(uid, {
          fixtureId,
          home,
          away,
          submittedAt: Date.now(),
          ...(predictedWinner !== undefined ? { predictedWinner } : {}),
        });
        setSaveStates((s) => ({ ...s, [fixtureId]: "saved" }));
      }, 500);
    },
    [uid],
  );

  const setOrder = useCallback(
    (group: string, order: number[]) => {
      setGroupOrders((prev) => ({ ...prev, [group]: order }));
      if (uid) {
        const pred: GroupPrediction = { group, order };
        void saveGroupPrediction(uid, pred);
      }
    },
    [uid],
  );

  const toggleThird = useCallback(
    (teamId: number, max: number) => {
      setThirdPlaceState((prev) => {
        let next: number[];
        if (prev.includes(teamId)) next = prev.filter((id) => id !== teamId);
        else if (prev.length < max) next = [...prev, teamId];
        else return prev;
        if (uid) {
          const pred: ThirdPlacePrediction = { advancing: next };
          void saveThirdPlace(uid, pred);
        }
        return next;
      });
    },
    [uid],
  );

  return {
    loaded,
    matches,
    groupOrders,
    thirdPlace,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
  };
}
