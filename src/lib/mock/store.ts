"use client";

/**
 * Client-side mock persistence (localStorage). Used only in mock mode so the
 * app is fully interactive without Firebase. Mirrors the Firestore shape so the
 * real data layer can swap in unchanged.
 */

import type {
  GroupPrediction,
  MatchPrediction,
  ThirdPlacePrediction,
  UserProfile,
} from "../types";
import { SEED_USERS } from "./seed";

const K = {
  users: "wc.mock.users",
  current: "wc.mock.currentUid",
  matchPreds: (uid: string) => `wc.mock.preds.match.${uid}`,
  groupPreds: (uid: string) => `wc.mock.preds.group.${uid}`,
  thirdPreds: (uid: string) => `wc.mock.preds.third.${uid}`,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** All users = seed users + any locally created ones (deduped by uid). */
export function getAllUsers(): UserProfile[] {
  const created = read<UserProfile[]>(K.users, []);
  const map = new Map<string, UserProfile>();
  for (const u of SEED_USERS) map.set(u.uid, u);
  for (const u of created) map.set(u.uid, u);
  return Array.from(map.values());
}

export function saveUser(user: UserProfile): void {
  const created = read<UserProfile[]>(K.users, []).filter(
    (u) => u.uid !== user.uid,
  );
  created.push(user);
  write(K.users, created);
}

export function getCurrentUid(): string | null {
  return read<string | null>(K.current, null);
}

export function setCurrentUid(uid: string | null): void {
  write(K.current, uid);
}

// ---- predictions ----

export function getMatchPredictions(uid: string): Record<number, MatchPrediction> {
  return read<Record<number, MatchPrediction>>(K.matchPreds(uid), {});
}

export function saveMatchPrediction(uid: string, pred: MatchPrediction): void {
  const all = getMatchPredictions(uid);
  all[pred.fixtureId] = pred;
  write(K.matchPreds(uid), all);
}

export function getGroupPredictions(uid: string): Record<string, GroupPrediction> {
  return read<Record<string, GroupPrediction>>(K.groupPreds(uid), {});
}

export function saveGroupPrediction(uid: string, pred: GroupPrediction): void {
  const all = getGroupPredictions(uid);
  all[pred.group] = pred;
  write(K.groupPreds(uid), all);
}

export function getThirdPlacePrediction(uid: string): ThirdPlacePrediction {
  return read<ThirdPlacePrediction>(K.thirdPreds(uid), { advancing: [] });
}

export function saveThirdPlacePrediction(
  uid: string,
  pred: ThirdPlacePrediction,
): void {
  write(K.thirdPreds(uid), pred);
}
