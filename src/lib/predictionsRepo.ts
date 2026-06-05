"use client";

/**
 * Unified predictions read/write that works in mock mode (localStorage) and
 * Firebase mode (Firestore). UI code calls these and never branches on mode.
 */

import { USE_MOCK } from "./config";
import type {
  GroupPrediction,
  MatchPrediction,
  ThirdPlacePrediction,
} from "./types";
import * as mock from "./mock/store";

/**
 * In Firebase mode, writing predictions for a uid other than the signed-in user
 * (admin acting on someone's behalf) is blocked by security rules, so it routes
 * through the admin API. Returns true if it handled the write.
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

async function loadAllPredictions(uid: string) {
  const res = await fetch(`/api/predictions?uid=${encodeURIComponent(uid)}`);
  if (!res.ok) return { matches: {}, groups: {}, third: { advancing: [] } };
  return res.json() as Promise<{
    matches: Record<number, MatchPrediction>;
    groups: Record<string, GroupPrediction>;
    third: ThirdPlacePrediction;
  }>;
}

export async function loadMatchPredictions(
  uid: string,
): Promise<Record<number, MatchPrediction>> {
  if (USE_MOCK) return mock.getMatchPredictions(uid);
  return (await loadAllPredictions(uid)).matches;
}

export async function saveMatchPrediction(
  uid: string,
  pred: MatchPrediction,
): Promise<void> {
  if (USE_MOCK) return mock.saveMatchPrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "match", pred)) return;
  const { getClientDb } = await import("./firebase/client");
  const { doc, setDoc } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) throw new Error("Firestore not available — prediction not saved.");
  try {
    await setDoc(
      doc(db, "predictions", uid, "matches", String(pred.fixtureId)),
      pred,
      { merge: true },
    );
  } catch (err) {
    console.error("[saveMatchPrediction] Firestore write failed:", err);
    throw new Error("Failed to save prediction. Please try again.");
  }
}

export async function loadGroupPredictions(
  uid: string,
): Promise<Record<string, GroupPrediction>> {
  if (USE_MOCK) return mock.getGroupPredictions(uid);
  return (await loadAllPredictions(uid)).groups;
}

export async function saveGroupPrediction(
  uid: string,
  pred: GroupPrediction,
): Promise<void> {
  if (USE_MOCK) return mock.saveGroupPrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "group", pred)) return;
  const { getClientDb } = await import("./firebase/client");
  const { doc, setDoc } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) throw new Error("Firestore not available — prediction not saved.");
  try {
    await setDoc(doc(db, "predictions", uid, "groups", pred.group), pred);
  } catch (err) {
    console.error("[saveGroupPrediction] Firestore write failed:", err);
    throw new Error("Failed to save group prediction. Please try again.");
  }
}

export async function loadThirdPlace(
  uid: string,
): Promise<ThirdPlacePrediction> {
  if (USE_MOCK) return mock.getThirdPlacePrediction(uid);
  return (await loadAllPredictions(uid)).third;
}

export async function saveThirdPlace(
  uid: string,
  pred: ThirdPlacePrediction,
): Promise<void> {
  if (USE_MOCK) return mock.saveThirdPlacePrediction(uid, pred);
  if (await adminWriteIfForOther(uid, "third", pred)) return;
  const { getClientDb } = await import("./firebase/client");
  const { doc, setDoc } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) throw new Error("Firestore not available — prediction not saved.");
  try {
    await setDoc(doc(db, "predictions", uid, "meta", "thirdPlace"), pred);
  } catch (err) {
    console.error("[saveThirdPlace] Firestore write failed:", err);
    throw new Error("Failed to save third-place prediction. Please try again.");
  }
}
