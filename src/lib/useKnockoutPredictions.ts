"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatchPrediction, Outcome } from "./types";
import type { SaveState } from "@/components/predictions/MatchPredictionCard";

// ---- localStorage helpers ----

interface KnockoutPendingStore {
  matches: Record<number, MatchPrediction>;
  lockedMatches: Set<number>; // fixtureIds that have been individually locked
  /** Last write time — used to reconcile local vs server draft across devices. */
  updatedAt?: number;
}
type SerializedKnockoutDraft = {
  matches?: Record<number, MatchPrediction>;
  lockedMatches?: number[];
  updatedAt?: number;
};

function lsKey(uid: string) {
  return `ko_predictions_${uid}`;
}

function loadKnockoutPending(uid: string): KnockoutPendingStore {
  try {
    const raw = localStorage.getItem(lsKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<KnockoutPendingStore, "lockedMatches"> & { lockedMatches?: number[] };
      return {
        ...parsed,
        lockedMatches: new Set(parsed.lockedMatches || []),
      };
    }
  } catch { /* ignore */ }
  return { matches: {}, lockedMatches: new Set() };
}

function saveKnockoutPending(uid: string, store: KnockoutPendingStore) {
  try {
    localStorage.setItem(
      lsKey(uid),
      JSON.stringify({
        matches: store.matches,
        lockedMatches: Array.from(store.lockedMatches),
        updatedAt: Date.now(),
      })
    );
  } catch { /* ignore */ }
}

function clearKnockoutPending(uid: string) {
  try {
    localStorage.removeItem(lsKey(uid));
  } catch { /* ignore */ }
}

/** Push the full knockout draft to the server for cross-device sync. */
async function postKnockoutDraft(store: KnockoutPendingStore) {
  try {
    const { getClientAuth } = await import("./firebase/client");
    const auth = getClientAuth();
    if (!auth) return;
    try {
      await auth.authStateReady();
    } catch { /* non-fatal */ }
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: "knockout-draft",
        payload: {
          matches: store.matches,
          lockedMatches: Array.from(store.lockedMatches),
          updatedAt: Date.now(),
        },
      }),
    });
  } catch { /* non-fatal */ }
}

// ---- hook ----

/**
 * Manages knockout round predictions with localStorage soft-save,
 * per-game locking, and all-at-once locking.
 */
export function useKnockoutPredictions(
  uid: string | undefined,
  syncDrafts = true
) {
  const [matches, setMatchesState] = useState<Record<number, MatchPrediction>>({});
  const [lockedMatches, setLockedMatchesState] = useState<Set<number>>(new Set());
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  const [isUserLocked, setIsUserLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  // Load on mount: merge Firestore (locked picks) + localStorage (pending)
  useEffect(() => {
    if (!uid) return;
    let active = true;

    fetch(`/api/predictions?uid=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;

        const koLocked = !!d.knockoutLocked;
        setIsUserLocked(koLocked);

        if (koLocked) {
          // Already locked — load from Firestore
          setMatchesState(d.knockoutMatches ?? {});
          clearKnockoutPending(uid);
        } else {
          // Not locked — merge Firestore draft with localStorage
          const localPending = loadKnockoutPending(uid);
          const serverDraftRaw = (d.knockoutDraft ?? null) as SerializedKnockoutDraft | null;
          const serverDraft: KnockoutPendingStore | null = serverDraftRaw
            ? {
              matches: serverDraftRaw.matches ?? {},
              lockedMatches: new Set(serverDraftRaw.lockedMatches ?? []),
              updatedAt: serverDraftRaw.updatedAt,
            }
            : null;

          const hasContent = (s: KnockoutPendingStore | null) =>
            !!s && Object.keys(s.matches ?? {}).length > 0;

          let chosen: KnockoutPendingStore;
          if (hasContent(serverDraft) && hasContent(localPending)) {
            chosen =
              (serverDraft?.updatedAt ?? 0) >= (localPending.updatedAt ?? 0)
                ? serverDraft!
                : localPending;
          } else if (hasContent(serverDraft)) {
            chosen = serverDraft!;
          } else {
            chosen = localPending;
          }

          const pending: KnockoutPendingStore = {
            matches: chosen.matches ?? {},
            lockedMatches: chosen.lockedMatches ?? new Set(),
          };

          saveKnockoutPending(uid, pending);
          setMatchesState(pending.matches);
          setLockedMatchesState(pending.lockedMatches);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        const pending = loadKnockoutPending(uid ?? "");
        setMatchesState(pending.matches);
        setLockedMatchesState(pending.lockedMatches);
        setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [uid]);

  // ---- setters — write to localStorage ----

  const setMatch = useCallback(
    (
      fixtureId: number,
      home: number | null,
      away: number | null,
      predictedWinner?: Outcome
    ) => {
      if (!uid || isUserLocked) return;

      const pred: MatchPrediction = {
        fixtureId,
        home: home ?? 0,
        away: away ?? 0,
        submittedAt: Date.now(),
        ...(predictedWinner !== undefined ? { predictedWinner } : {}),
      };

      setMatchesState((prev) => {
        const next = { ...prev, [fixtureId]: pred };
        const pending = loadKnockoutPending(uid);
        saveKnockoutPending(uid, { ...pending, matches: next });
        return next;
      });

      // Flash the save state
      setSaveStates((prev) => ({ ...prev, [fixtureId]: "saving" }));
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [fixtureId]: "saved" }));
      }, 200);
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [fixtureId]: "idle" }));
      }, 1500);
    },
    [uid, isUserLocked]
  );

  // ---- per-game lock ----

  const lockGame = useCallback(
    (fixtureId: number) => {
      if (!uid || isUserLocked || !matches[fixtureId]) return;

      setLockedMatchesState((prev) => {
        const next = new Set(prev);
        next.add(fixtureId);
        const pending = loadKnockoutPending(uid);
        saveKnockoutPending(uid, { ...pending, lockedMatches: next });
        return next;
      });
    },
    [uid, isUserLocked, matches]
  );

  // ---- lock all games at once ----

  const lockAllGames = useCallback(async () => {
    if (!uid || locking || isUserLocked) return;

    setLocking(true);
    setLockError(null);

    try {
      const { getClientAuth } = await import("./firebase/client");
      const auth = getClientAuth();
      if (!auth) throw new Error("Firebase not configured");

      try {
        await auth.authStateReady();
      } catch { /* */ }

      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Not signed in — please refresh and try again.");

      const res = await fetch("/api/lock-in-knockout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          predictions: Object.values(matches),
        }),
      });

      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(error ?? "Knockout lock-in failed");
      }

      clearKnockoutPending(uid);
      setIsUserLocked(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Knockout lock-in failed";
      setLockError(msg);
    } finally {
      setLocking(false);
    }
  }, [uid, matches, locking, isUserLocked]);

  // ---- cross-device draft sync: debounce-save the full draft to the server ----

  useEffect(() => {
    if (!syncDrafts || !uid || !loaded || isUserLocked) return;

    const store: KnockoutPendingStore = {
      matches,
      lockedMatches,
    };

    const t = setTimeout(() => {
      void postKnockoutDraft(store);
    }, 1000);

    return () => clearTimeout(t);
  }, [syncDrafts, uid, loaded, isUserLocked, matches, lockedMatches]);

  const pendingCount = useMemo(() => {
    if (!uid || isUserLocked) return 0;
    try {
      const raw = localStorage.getItem(lsKey(uid));
      if (!raw) return 0;
      const p = JSON.parse(raw) as Omit<KnockoutPendingStore, "lockedMatches"> & {
        lockedMatches?: number[];
      };
      return Object.keys(p.matches ?? {}).length;
    } catch {
      return 0;
    }
  }, [uid, isUserLocked]);

  return {
    loaded,
    matches,
    lockedMatches,
    saveStates,
    setMatch,
    lockGame,
    lockAllGames,
    isUserLocked,
    locking,
    lockError,
    pendingCount,
  };
}
