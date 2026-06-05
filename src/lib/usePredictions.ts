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
  saveGroupPrediction,
  saveMatchPrediction,
  saveThirdPlace,
} from "./predictionsRepo";

/**
 * Loads and persists a user's predictions.
 *
 * All three prediction types auto-save to Firestore as the user enters them
 * (match scores debounced 500ms, group ordering and third-place immediately).
 * This lets users save partial work and return later.
 *
 * lockIn() is a separate finalization step: it sets the userLock flag in
 * Firestore and disables all further edits.
 */
export function usePredictions(uid: string | undefined, groups: GroupBundle[]) {
  const [matches, setMatches] = useState<Record<number, MatchPrediction>>({});
  const [groupOrders, setGroupOrders] = useState<Record<string, number[]>>({});
  const [groupOverridden, setGroupOverriddenState] = useState<Record<string, boolean>>({});
  const [thirdPlace, setThirdPlaceState] = useState<number[]>([]);
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [loaded, setLoaded] = useState(false);
  const [isUserLocked, setIsUserLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Initial load via server API (avoids Firestore client auth timing issues)
  useEffect(() => {
    if (!uid) return;
    let active = true;
    fetch(`/api/predictions?uid=${uid}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        setMatches(d.matches ?? {});
        const orders: Record<string, number[]> = {};
        const overrides: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(d.groups ?? {})) {
          const gp = v as GroupPrediction;
          orders[k] = gp.order;
          if (gp.overridden) overrides[k] = true;
        }
        setGroupOrders(orders);
        setGroupOverriddenState(overrides);
        setThirdPlaceState((d.third as ThirdPlacePrediction)?.advancing ?? []);
        setIsUserLocked(!!d.userLocked);
        setLoaded(true);
      })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [uid]);

  // Auto-populate any missing group order from WC standings
  useEffect(() => {
    if (!loaded || groups.length === 0) return;
    setGroupOrders(prev => {
      const next = { ...prev };
      let changed = false;
      for (const g of groups) {
        if (!next[g.group] || next[g.group].length !== g.teams.length) {
          next[g.group] = g.teams.map(t => t.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loaded, groups]);

  // Match scores — auto-save with 500ms debounce
  const setMatch = useCallback(
    (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => {
      const pred: MatchPrediction = {
        fixtureId,
        home: home ?? 0,
        away: away ?? 0,
        submittedAt: Date.now(),
        ...(predictedWinner !== undefined ? { predictedWinner } : {}),
      };
      setMatches(prev => ({ ...prev, [fixtureId]: pred }));
      if (home === null || away === null || !uid) return;

      setSaveStates(s => ({ ...s, [fixtureId]: "saving" }));
      clearTimeout(timers.current[fixtureId]);
      timers.current[fixtureId] = setTimeout(async () => {
        try {
          await saveMatchPrediction(uid, pred);
          setSaveStates(s => ({ ...s, [fixtureId]: "saved" }));
        } catch {
          setSaveStates(s => ({ ...s, [fixtureId]: "idle" }));
        }
      }, 500);
    },
    [uid],
  );

  // Group ordering — auto-save immediately
  const setOrder = useCallback(
    (group: string, order: number[], overridden = false) => {
      setGroupOrders(prev => ({ ...prev, [group]: order }));
      setGroupOverriddenState(prev => ({ ...prev, [group]: overridden }));
      if (uid) void saveGroupPrediction(uid, { group, order, overridden });
    },
    [uid],
  );

  // Third-place picks — auto-save immediately
  const toggleThird = useCallback(
    (teamId: number, max: number) => {
      setThirdPlaceState(prev => {
        let next: number[];
        if (prev.includes(teamId)) next = prev.filter(id => id !== teamId);
        else if (prev.length < max) next = [...prev, teamId];
        else return prev;
        if (uid) void saveThirdPlace(uid, { advancing: next });
        return next;
      });
    },
    [uid],
  );

  // Lock In — saves a final snapshot and sets the permanent lock flag
  const lockIn = useCallback(async () => {
    if (!uid || locking) return;
    setLocking(true);
    try {
      const { getClientAuth } = await import("./firebase/client");
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase not configured");
      try {
        if (typeof (auth as { authStateReady?: () => Promise<void> }).authStateReady === "function")
          await (auth as { authStateReady: () => Promise<void> }).authStateReady();
      } catch { /* non-fatal */ }
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/lock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictions: Object.values(matches) }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error ?? "Lock-in failed");
      }
      setIsUserLocked(true);
    } finally {
      setLocking(false);
    }
  }, [uid, matches, locking]);

  return {
    loaded,
    matches,
    groupOrders,
    groupOverridden,
    thirdPlace,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
    lockIn,
    isUserLocked,
    locking,
  };
}
