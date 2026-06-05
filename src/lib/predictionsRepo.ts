"use client";

/**
 * Unified predictions read/write that works in mock mode (localStorage) and
 * Firebase mode.
 *
 * ALL writes in Firebase mode go through POST /api/predictions which uses
 * the Admin SDK — this bypasses Firestore client auth timing issues that
 * caused saves to fail silently after navigation.
 */

import { USE_MOCK } from "./config";
import type {
  GroupPrediction,
  MatchPrediction,
  ThirdPlacePrediction,
} from "./types";
import * as mock from "./mock/store";

/** Get a Firebase ID token for the current user.
 *  Waits for authStateReady() so we never read currentUser before the
 *  SDK has restored the persisted session from IndexedDB.
 */
async function getToken(): Promise<string | null> {
  const { getClientAuth } = await import("./firebase/client");
  const { getAuth } = await import("firebase/auth");
  const { getApps } = await import("firebase/app");
  const auth = getClientAuth();
  if (!auth) return null;
  // authStateReady() resolves once the SDK has restored any persisted session.
  // Without this, currentUser can be null on first page load even when signed in.
  try { await auth.authStateReady(); } catch { /* non-fatal */ }
  if (auth.currentUser) return auth.currentUser.getIdToken();
  // Fallback: in case getClientAuth() returned a stale instance, try every app.
  for (const app of getApps()) {
    const a = getAuth(app);
    try { await a.authStateReady(); } catch { /* non-fatal */ }
    if (a.currentUser) return a.currentUser.getIdToken();
  }
  return null;
}

/**
 * For admin-on-behalf-of writes, the token belongs to the admin
 * but we pass the target uid — the admin API handles it.
 * Returns true if the write was handled, false if it's a self-write.
 */
async function adminWriteIfForOther(
  uid: string,
  type: "match" | "group" | "third",
  payload: unknown,
): Promise<boolean> {
  const { getClientAuth } = await import("./firebase/client");
  const auth = getClientAuth();
  const current = auth?.currentUser;
  if (!current || current.uid === uid) return false;
  const token = await current.getIdToken();
  await fetch("/api/admin/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uid, type, payload }),
  });
  return true;
}

/** Save via POST /api/predictions (Admin SDK — always works). */
async function serverSave(
  type: "match" | "group" | "third",
  payload: unknown,
): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch("/api/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(error ?? "Save failed");
  }
}

async function loadAllPredictions(uid: string) {
  const res = await fetch(`/api/predictions?uid=${encodeURIComponent(uid)}`);
  if (!res.ok) return { matches: {}, groups: {}, third: { advancing: [] } };
  return res.json() as Promise<{
    matches: Record<number, MatchPrediction>;
    groups: Record<string, GroupPrediction>;
    third: ThirdPlacePrediction;
  }>;
}

export async function loadMatchPredictions(uid: string): Promise<Record<number, MatchPrediction>> {
  if (USE_MOCK) return mock.getMatchPredictions(uid);
  return (await loadAllPredictions(uid)).matches;
}

export async function saveMatchPrediction(uid: string, pred: MatchPrediction): Promise<void> {
  if (USE_MOCK) return mock.saveMatchPrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "match", pred)) return;
  await serverSave("match", pred);
}

export async function loadGroupPredictions(uid: string): Promise<Record<string, GroupPrediction>> {
  if (USE_MOCK) return mock.getGroupPredictions(uid);
  return (await loadAllPredictions(uid)).groups;
}

export async function saveGroupPrediction(uid: string, pred: GroupPrediction): Promise<void> {
  if (USE_MOCK) return mock.saveGroupPrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "group", pred)) return;
  await serverSave("group", pred);
}

export async function loadThirdPlace(uid: string): Promise<ThirdPlacePrediction> {
  if (USE_MOCK) return mock.getThirdPlacePrediction(uid);
  return (await loadAllPredictions(uid)).third;
}

export async function saveThirdPlace(uid: string, pred: ThirdPlacePrediction): Promise<void> {
  if (USE_MOCK) return mock.saveThirdPlacePrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "third", pred)) return;
  await serverSave("third", pred);
}
