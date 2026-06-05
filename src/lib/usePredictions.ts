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

// ---- localStorage helpers ----

interface PendingStore {
  matches:               Record<number, MatchPrediction>;
  groups:                Record<string, GroupPrediction>;
  thirdPlace:            number[];
  thirdPlaceOverridden?: boolean;
}

function lsKey(uid: string) { return `pred_pending_${uid}`; }

function loadPending(uid: string): PendingStore {
  try {
    const raw = localStorage.getItem(lsKey(uid));
    if (raw) return JSON.parse(raw) as PendingStore;
  } catch { /* ignore */ }
  return { matches: {}, groups: {}, thirdPlace: [] };
}

function savePending(uid: string, store: PendingStore) {
  try { localStorage.setItem(lsKey(uid), JSON.stringify(store)); } catch { /* ignore */ }
}

function clearPending(uid: string) {
  try { localStorage.removeItem(lsKey(uid)); } catch { /* ignore */ }
}

// ---- hook ----

/**
 * Manages predictions with localStorage soft-save.
 *
 * Nothing is written to Firestore until the user explicitly calls lockIn().
 * localStorage persists picks across navigation, tab switching, and logout/login
 * with the same account.
 *
 * On mount: merges Firestore data (already-locked picks) with any pending localStorage data.
 * On lockIn: POSTs everything to /api/lock-in (Admin SDK), then clears localStorage.
 */
export function usePredictions(uid: string | undefined, groups: GroupBundle[]) {
  const [matches,    setMatches]    = useState<Record<number, MatchPrediction>>({});
  const [groupOrders,setGroupOrders] = useState<Record<string, number[]>>({});
  const [groupOverridden, setGroupOverriddenState] = useState<Record<string, boolean>>({});
  const [thirdPlace, setThirdPlaceState] = useState<number[]>([]);
  const [thirdPlaceOverridden, setThirdPlaceOverridden] = useState(false);
  const [isUserLocked, setIsUserLocked] = useState(false);
  const [locking,    setLocking]    = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [lockError,  setLockError]  = useState<string | null>(null);

  // saveStates is always "idle" — we no longer auto-save per card,
  // but keep the field for API compatibility with MatchPredictionCard.
  const saveStates: Record<number, SaveState> = useMemo(() => ({}), []);

  // Load on mount: merge Firestore (locked picks) + localStorage (pending)
  useEffect(() => {
    if (!uid) return;
    let active = true;
    fetch(`/api/predictions?uid=${uid}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        const isLocked = !!d.userLocked;
        setIsUserLocked(isLocked);

        if (isLocked) {
          // Already submitted — use Firestore data only, ignore localStorage
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
          clearPending(uid); // clean up any leftover localStorage
        } else {
          // Not locked yet — merge Firestore with localStorage (localStorage wins)
          const pending = loadPending(uid);
          const mergedMatches = { ...(d.matches ?? {}), ...pending.matches };
          setMatches(mergedMatches);

          const orders: Record<string, number[]> = {};
          const overrides: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(d.groups ?? {})) {
            const gp = v as GroupPrediction;
            orders[k] = gp.order;
            if (gp.overridden) overrides[k] = true;
          }
          // Merge group orders from localStorage
          for (const [k, v] of Object.entries(pending.groups ?? {})) {
            orders[k] = v.order;
            if (v.overridden) overrides[k] = true;
          }
          setGroupOrders(orders);
          setGroupOverriddenState(overrides);

          const mergedThird = pending.thirdPlace.length > 0
            ? pending.thirdPlace
            : ((d.third as ThirdPlacePrediction)?.advancing ?? []);
          setThirdPlaceState(mergedThird);
          if (pending.thirdPlaceOverridden) setThirdPlaceOverridden(true);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        // Fall back to localStorage only
        const pending = loadPending(uid ?? "");
        setMatches(pending.matches);
        const orders: Record<string, number[]> = {};
        for (const [k, v] of Object.entries(pending.groups ?? {}))
          orders[k] = v.order;
        setGroupOrders(orders);
        setThirdPlaceState(pending.thirdPlace);
        setLoaded(true);
      });
    return () => { active = false; };
  }, [uid]);

  // Auto-populate missing group orders from WC standings
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

  // ---- setters — all write to localStorage, nothing to Firestore ----

  const setMatch = useCallback(
    (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => {
      if (!uid) return;
      const pred: MatchPrediction = {
        fixtureId,
        home: home ?? 0,
        away: away ?? 0,
        submittedAt: Date.now(),
        ...(predictedWinner !== undefined ? { predictedWinner } : {}),
      };
      setMatches(prev => {
        const next = { ...prev, [fixtureId]: pred };
        // Persist to localStorage immediately
        const pending = loadPending(uid);
        savePending(uid, { ...pending, matches: next });
        return next;
      });
    },
    [uid],
  );

  const setOrder = useCallback(
    (group: string, order: number[], overridden = false) => {
      if (!uid) return;
      setGroupOrders(prev => ({ ...prev, [group]: order }));
      setGroupOverriddenState(prev => ({ ...prev, [group]: overridden }));
      const pending = loadPending(uid);
      const groups = { ...pending.groups, [group]: { group, order, overridden } };
      savePending(uid, { ...pending, groups });
    },
    [uid],
  );

  const toggleThird = useCallback(
    (teamId: number, max: number) => {
      if (!uid) return;
      setThirdPlaceOverridden(true);
      setThirdPlaceState(prev => {
        let next: number[];
        if (prev.includes(teamId)) next = prev.filter(id => id !== teamId);
        else if (prev.length < max) next = [...prev, teamId];
        else return prev;
        const pending = loadPending(uid);
        savePending(uid, { ...pending, thirdPlace: next, thirdPlaceOverridden: true });
        return next;
      });
    },
    [uid],
  );

  /** Called by PredictionsClient when the auto-computed selection changes. */
  const setThirdPlaceAuto = useCallback(
    (ids: number[]) => {
      if (!uid || thirdPlaceOverridden) return;
      setThirdPlaceState(ids);
      const pending = loadPending(uid);
      savePending(uid, { ...pending, thirdPlace: ids, thirdPlaceOverridden: false });
    },
    [uid, thirdPlaceOverridden],
  );

  /** Mark third-place as manually overridden without changing the selection. */
  const overrideThirdPlace = useCallback(() => {
    if (!uid) return;
    setThirdPlaceOverridden(true);
    const pending = loadPending(uid);
    savePending(uid, { ...pending, thirdPlaceOverridden: true });
  }, [uid]);

  const resetThirdPlaceOverride = useCallback(
    (autoIds: number[]) => {
      if (!uid) return;
      setThirdPlaceOverridden(false);
      setThirdPlaceState(autoIds);
      const pending = loadPending(uid);
      savePending(uid, { ...pending, thirdPlace: autoIds, thirdPlaceOverridden: false });
    },
    [uid],
  );

  // ---- lockIn — the only write to Firestore ----

  const lockIn = useCallback(async () => {
    if (!uid || locking || isUserLocked) return;
    setLocking(true);
    setLockError(null);
    try {
      const { getClientAuth } = await import("./firebase/client");
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase not configured");
      try { await auth.authStateReady(); } catch { /* */ }
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in — please refresh and try again.");

      // Save all predictions via Admin SDK
      const res = await fetch("/api/lock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictions: Object.values(matches) }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error ?? "Lock-in failed");
      }
      // Also save group orders and third place
      const pending = loadPending(uid);
      for (const gp of Object.values(pending.groups)) {
        await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type: "group", payload: gp }),
        });
      }
      if (pending.thirdPlace.length > 0) {
        await fetch("/api/predictions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type: "third", payload: { advancing: pending.thirdPlace } }),
        });
      }

      clearPending(uid);
      setIsUserLocked(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lock-in failed";
      setLockError(msg);
    } finally {
      setLocking(false);
    }
  }, [uid, matches, locking, isUserLocked]);

  const pendingCount = useMemo(() => {
    if (!uid || isUserLocked) return 0;
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (!raw) return 0;
      const p = JSON.parse(raw) as PendingStore;
      return Object.keys(p.matches ?? {}).length;
    } catch { return 0; }
  }, [uid, isUserLocked, matches]); // matches as dep so it recalculates when picks change

  return {
    loaded,
    matches,
    groupOrders,
    groupOverridden,
    thirdPlace,
    thirdPlaceOverridden,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
    setThirdPlaceAuto,
    overrideThirdPlace,
    resetThirdPlaceOverride,
    lockIn,
    isUserLocked,
    locking,
    lockError,
    pendingCount,
  };
}
