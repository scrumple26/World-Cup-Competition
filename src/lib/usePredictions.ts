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
  /** Last write time — used to reconcile local vs server draft across devices. */
  updatedAt?:            number;
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
  try { localStorage.setItem(lsKey(uid), JSON.stringify({ ...store, updatedAt: Date.now() })); } catch { /* ignore */ }
}

/** Push the full draft to the server so soft-saved picks carry across devices. */
async function postDraft(store: PendingStore) {
  try {
    const { getClientAuth } = await import("./firebase/client");
    const auth = getClientAuth();
    if (!auth) return;
    try { await auth.authStateReady(); } catch { /* non-fatal */ }
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "draft", payload: { ...store, updatedAt: Date.now() } }),
    });
  } catch { /* non-fatal */ }
}

function clearPending(uid: string) {
  try { localStorage.removeItem(lsKey(uid)); } catch { /* ignore */ }
}

// ---- hook ----

/**
 * Manages predictions with localStorage soft-save.
 *
 * Nothing is written to Firestore until the user calls lockIn() OR the deadline passes.
 * The deadline is the kickoff time of the first group stage match — all picks lock then.
 */
export function usePredictions(
  uid: string | undefined,
  groups: GroupBundle[],
  deadline?: string | null,
  syncDrafts = true,
) {
  const [matches,    setMatches]    = useState<Record<number, MatchPrediction>>({});
  const [groupOrders,setGroupOrders] = useState<Record<string, number[]>>({});
  const [groupOverridden, setGroupOverriddenState] = useState<Record<string, boolean>>({});
  const [thirdPlace, setThirdPlaceState] = useState<number[]>([]);
  const [thirdPlaceOverridden, setThirdPlaceOverridden] = useState(false);
  const [isUserLocked, setIsUserLocked] = useState(false);
  const [isKnockoutUnlocked, setIsKnockoutUnlocked] = useState(false);
  const [locking,    setLocking]    = useState(false);
  const [lockingKnockout, setLockingKnockout] = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [lockError,  setLockError]  = useState<string | null>(null);
  const [lockKnockoutError, setLockKnockoutError] = useState<string | null>(null);

  // ---- deadline enforcement ----

  const [isPastDeadline, setIsPastDeadline] = useState(() =>
    deadline ? Date.now() >= new Date(deadline).getTime() : false,
  );

  // Timer that flips isPastDeadline when the page is open as deadline approaches
  useEffect(() => {
    if (!deadline || isPastDeadline) return;
    const ms = new Date(deadline).getTime() - Date.now();
    if (ms <= 0) { setIsPastDeadline(true); return; }
    const t = setTimeout(() => setIsPastDeadline(true), Math.min(ms, 2_147_483_647));
    return () => clearTimeout(t);
  }, [deadline, isPastDeadline]);

  // isLocked = manually locked in OR deadline has passed
  const isLocked = isUserLocked || isPastDeadline;

  // saveStates kept for API compatibility with MatchPredictionCard
  const saveStates: Record<number, SaveState> = useMemo(() => ({}), []);

  // Load on mount: merge Firestore (locked picks) + localStorage (pending)
  useEffect(() => {
    if (!uid) return;
    let active = true;
    fetch(`/api/predictions?uid=${uid}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        const fireLocked = !!d.userLocked;
        setIsUserLocked(fireLocked);
        setIsKnockoutUnlocked(!!d.knockoutUnlocked);

        if (fireLocked) {
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
          clearPending(uid);
        } else {
          const localPending = loadPending(uid);
          const serverDraft = (d.draft ?? null) as PendingStore | null;
          const hasContent = (s: PendingStore | null) =>
            !!s && (Object.keys(s.matches ?? {}).length > 0
              || Object.keys(s.groups ?? {}).length > 0
              || (s.thirdPlace ?? []).length > 0);
          // Cross-device: prefer whichever draft is newer; else whichever has content.
          let chosen: PendingStore;
          if (hasContent(serverDraft) && hasContent(localPending)) {
            chosen = (serverDraft!.updatedAt ?? 0) >= (localPending.updatedAt ?? 0)
              ? serverDraft! : localPending;
          } else if (hasContent(serverDraft)) {
            chosen = serverDraft!;
          } else {
            chosen = localPending;
          }
          const pending: PendingStore = {
            matches: chosen.matches ?? {},
            groups: chosen.groups ?? {},
            thirdPlace: chosen.thirdPlace ?? [],
            thirdPlaceOverridden: chosen.thirdPlaceOverridden,
          };
          // Keep this device's localStorage in sync with the chosen draft.
          savePending(uid, pending);
          const mergedMatches = { ...(d.matches ?? {}), ...pending.matches };
          setMatches(mergedMatches);

          const orders: Record<string, number[]> = {};
          const overrides: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(d.groups ?? {})) {
            const gp = v as GroupPrediction;
            orders[k] = gp.order;
            if (gp.overridden) overrides[k] = true;
          }
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

  // ---- setters — all write to localStorage, blocked after deadline ----

  const setMatch = useCallback(
    (
      fixtureId: number,
      home: number | null,
      away: number | null,
      predictedWinner?: Outcome,
      allowWhenUserLocked = false,
    ) => {
      if (!uid || isPastDeadline) return;
      const canEditWhenLocked = allowWhenUserLocked && isKnockoutUnlocked;
      if (isUserLocked && !canEditWhenLocked) return;
      const pred: MatchPrediction = {
        fixtureId,
        home: home ?? 0,
        away: away ?? 0,
        submittedAt: Date.now(),
        ...(predictedWinner !== undefined ? { predictedWinner } : {}),
      };
      setMatches(prev => {
        const next = { ...prev, [fixtureId]: pred };
        const pending = loadPending(uid);
        savePending(uid, { ...pending, matches: next });
        return next;
      });
    },
    [uid, isUserLocked, isKnockoutUnlocked, isPastDeadline],
  );

  const setOrder = useCallback(
    (group: string, order: number[], overridden = false) => {
      if (!uid || isUserLocked || isPastDeadline) return;
      setGroupOrders(prev => ({ ...prev, [group]: order }));
      setGroupOverriddenState(prev => ({ ...prev, [group]: overridden }));
      const pending = loadPending(uid);
      const grps = { ...pending.groups, [group]: { group, order, overridden } };
      savePending(uid, { ...pending, groups: grps });
    },
    [uid, isUserLocked, isPastDeadline],
  );

  const toggleThird = useCallback(
    (teamId: number, max: number) => {
      if (!uid || isUserLocked || isPastDeadline) return;
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
    [uid, isUserLocked, isPastDeadline],
  );

  const setThirdPlaceAuto = useCallback(
    (ids: number[]) => {
      if (!uid || thirdPlaceOverridden || isUserLocked || isPastDeadline) return;
      setThirdPlaceState(ids);
      const pending = loadPending(uid);
      savePending(uid, { ...pending, thirdPlace: ids, thirdPlaceOverridden: false });
    },
    [uid, thirdPlaceOverridden, isUserLocked, isPastDeadline],
  );

  const overrideThirdPlace = useCallback(() => {
    if (!uid || isUserLocked || isPastDeadline) return;
    setThirdPlaceOverridden(true);
    const pending = loadPending(uid);
    savePending(uid, { ...pending, thirdPlaceOverridden: true });
  }, [uid, isUserLocked, isPastDeadline]);

  const resetThirdPlaceOverride = useCallback(
    (autoIds: number[]) => {
      if (!uid || isUserLocked || isPastDeadline) return;
      setThirdPlaceOverridden(false);
      setThirdPlaceState(autoIds);
      const pending = loadPending(uid);
      savePending(uid, { ...pending, thirdPlace: autoIds, thirdPlaceOverridden: false });
    },
    [uid, isUserLocked, isPastDeadline],
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

      const res = await fetch("/api/lock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictions: Object.values(matches) }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error ?? "Lock-in failed");
      }
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

      // Snapshot the locked-in picks for safekeeping (non-critical).
      await fetch("/api/backup-picks", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* never block lock-in */ });

      clearPending(uid);
      setIsUserLocked(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lock-in failed";
      setLockError(msg);
    } finally {
      setLocking(false);
    }
  }, [uid, matches, locking, isUserLocked]);

  // ---- lockInKnockout — saves knockout picks and re-locks the knockout stage ----

  const lockInKnockout = useCallback(async () => {
    if (!uid || lockingKnockout || !isKnockoutUnlocked) return;
    setLockingKnockout(true);
    setLockKnockoutError(null);
    try {
      const { getClientAuth } = await import("./firebase/client");
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase not configured");
      try { await auth.authStateReady(); } catch { /* */ }
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in — please refresh and try again.");

      const res = await fetch("/api/lock-in-knockout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ predictions: Object.values(matches) }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(error ?? "Knockout lock-in failed");
      }
      setIsKnockoutUnlocked(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Knockout lock-in failed";
      setLockKnockoutError(msg);
    } finally {
      setLockingKnockout(false);
    }
  }, [uid, matches, lockingKnockout, isKnockoutUnlocked]);

  // No auto-lock at the deadline: locking in is an explicit, all-at-once action.
  // The deadline is a hard lockout (enforced server-side too) — anyone who has
  // not locked in by then scores 0. Past the deadline the UI is read-only via
  // isLocked, so picks simply can no longer be submitted.

  // ---- cross-device draft sync: debounce-save the full draft to the server ----
  useEffect(() => {
    if (!syncDrafts || !uid || !loaded || isLocked) return;
    const groupsRec: Record<string, GroupPrediction> = {};
    for (const [g, order] of Object.entries(groupOrders)) {
      groupsRec[g] = { group: g, order, ...(groupOverridden[g] ? { overridden: true } : {}) };
    }
    const store: PendingStore = { matches, groups: groupsRec, thirdPlace, thirdPlaceOverridden };
    const t = setTimeout(() => { void postDraft(store); }, 1000);
    return () => clearTimeout(t);
  }, [syncDrafts, uid, loaded, isLocked, matches, groupOrders, groupOverridden, thirdPlace, thirdPlaceOverridden]);

  const pendingCount = useMemo(() => {
    if (!uid || isLocked) return 0;
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (!raw) return 0;
      const p = JSON.parse(raw) as PendingStore;
      return Object.keys(p.matches ?? {}).length;
    } catch { return 0; }
  }, [uid, isLocked, matches]);

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
    lockInKnockout,
    isUserLocked,
    isKnockoutUnlocked,
    isPastDeadline,
    isLocked,
    locking,
    lockingKnockout,
    lockError,
    lockKnockoutError,
    pendingCount,
  };
}
