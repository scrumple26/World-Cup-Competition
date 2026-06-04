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

export async function loadMatchPredictions(
  uid: string,
): Promise<Record<number, MatchPrediction>> {
  if (USE_MOCK) return mock.getMatchPredictions(uid);
  const { getClientDb } = await import("./firebase/client");
  const { collection, getDocs } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) return {};
  const snap = await getDocs(collection(db, "predictions", uid, "matches"));
  const out: Record<number, MatchPrediction> = {};
  snap.forEach((d) => {
    const p = d.data() as MatchPrediction;
    out[p.fixtureId] = p;
  });
  return out;
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
  if (!db) return;
  await setDoc(
    doc(db, "predictions", uid, "matches", String(pred.fixtureId)),
    pred,
    { merge: true },
  );
}

export async function loadGroupPredictions(
  uid: string,
): Promise<Record<string, GroupPrediction>> {
  if (USE_MOCK) return mock.getGroupPredictions(uid);
  const { getClientDb } = await import("./firebase/client");
  const { collection, getDocs } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) return {};
  const snap = await getDocs(collection(db, "predictions", uid, "groups"));
  const out: Record<string, GroupPrediction> = {};
  snap.forEach((d) => {
    const p = d.data() as GroupPrediction;
    out[p.group] = p;
  });
  return out;
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
  if (!db) return;
  // Firestore doc ids can't contain "/"; "Group A" is fine.
  await setDoc(doc(db, "predictions", uid, "groups", pred.group), pred);
}

export async function loadThirdPlace(
  uid: string,
): Promise<ThirdPlacePrediction> {
  if (USE_MOCK) return mock.getThirdPlacePrediction(uid);
  const { getClientDb } = await import("./firebase/client");
  const { doc, getDoc } = await import("firebase/firestore");
  const db = getClientDb();
  if (!db) return { advancing: [] };
  const snap = await getDoc(doc(db, "predictions", uid, "meta", "thirdPlace"));
  return snap.exists() ? (snap.data() as ThirdPlacePrediction) : { advancing: [] };
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
  if (!db) return;
  await setDoc(doc(db, "predictions", uid, "meta", "thirdPlace"), pred);
}
