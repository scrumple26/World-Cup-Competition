"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GroupPrediction,
  MatchPrediction,
  Outcome,
  ThirdPlacePrediction,
} from "./types";
import type { GroupBundle } from "./wcClient";
import type { SaveState } from "@/components/predictions/MatchPredictionCard";
import {
  saveGroupPrediction,
  saveThirdPlace,
} from "./predictionsRepo";

/**
 * Loads and persists a user's predictions.
 *
 * Match score predictions use a SOFT-SAVE model:
 *   - setMatch() stores changes in local state only (no Firestore)
 *   - lockIn() submits everything to Firestore via /api/lock-in
 *   - isUserLocked becomes true after lock-in (loaded from Firestore on mount)
 *
 * Group ordering and third-place picks auto-save as before.
 */
export function usePredictions(uid: string | undefined, groups: GroupBundle[]) {
  // Firestore-persisted predictions (loaded on mount)
  const [savedMatches, setSavedMatches] = useState<Record<number, MatchPrediction>>({});
  // Local unsaved changes (soft saves — not in Firestore yet)
  const [localChanges, setLocalChanges] = useState<Record<number, MatchPrediction>>({});
  const [groupOrders, setGroupOrders] = useState<Record<string, number[]>>({});
  const [thirdPlace, setThirdPlaceState] = useState<number[]>([]);
  const [saveStates] = useState<Record<number, SaveState>>({});
  const [loaded, setLoaded] = useState(false);
  const [isUserLocked, setIsUserLocked] = useState(false);
  const [locking, setLocking] = useState(false);

  // Merge: local changes override saved for display purposes
  const matches = useMemo(
    () => ({ ...savedMatches, ...localChanges }),
    [savedMatches, localChanges],
  );

  const pendingCount = Object.keys(localChanges).length;

  // Initial load
  useEffect(() => {
    if (!uid) return;
    let active = true;
    Promise.all([
      // Use /api/predictions which returns userLocked status
      fetch(`/api/predictions?uid=${uid}`)
        .then(r => r.json())
        .then(d => ({ matches: d.matches ?? {}, groups: d.groups ?? {}, third: d.third ?? { advancing: [] }, userLocked: !!d.userLocked })),
      // Group orders and third place via repo (already goes through server API)
    ]).then(([data]) => {
      if (!active) return;
      setSavedMatches(data.matches);
      const orders: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(data.groups)) orders[k] = (v as GroupPrediction).order;
      setGroupOrders(orders);
      setThirdPlaceState((data.third as ThirdPlacePrediction).advancing ?? []);
      setIsUserLocked(data.userLocked);
      setLoaded(true);
    }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [uid]);

  // Auto-populate missing group orders from standings
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

  /**
   * Soft-save a match prediction — stores in local state only.
   * Nothing is written to Firestore until lockIn() is called.
   */
  const setMatch = useCallback(
    (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => {
      if (home === null || away === null) return;
      setLocalChanges((prev) => ({
        ...prev,
        [fixtureId]: {
          ...prev[fixtureId],
          fixtureId,
          home,
          away,
          submittedAt: Date.now(),
          ...(predictedWinner !== undefined ? { predictedWinner } : {}),
        },
      }));
    },
    [],
  );

  /**
   * Lock in all predictions — saves every prediction (saved + local) to Firestore.
   * After this, isUserLocked = true and inputs are disabled.
   */
  const lockIn = useCallback(async () => {
    if (!uid || locking) return;
    setLocking(true);
    try {
      const all = { ...savedMatches, ...localChanges };
      const predictions = Object.values(all);

      const { getClientAuth } = await import("./firebase/client");
      const auth = getClientAuth();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/lock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictions }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error ?? "Lock-in failed");
      }

      // Merge local into saved and clear pending changes
      setSavedMatches(all);
      setLocalChanges({});
      setIsUserLocked(true);
    } finally {
      setLocking(false);
    }
  }, [uid, savedMatches, localChanges, locking]);

  // Group ordering — still auto-saves
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

  // Third-place — still auto-saves
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
    lockIn,
    isUserLocked,
    locking,
    pendingCount,
  };
}
