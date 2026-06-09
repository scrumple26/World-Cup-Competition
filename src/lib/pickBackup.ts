import "server-only";

/**
 * Per-player pick backups.
 *
 * When a player locks in, we snapshot their full set of picks into
 * `pickBackups/{uid}` — an immutable safety copy of exactly what they committed,
 * independent of any later edits, auto-fills, or admin changes.
 */

import type { Firestore } from "firebase-admin/firestore";
import type {
  GroupPrediction,
  MatchPrediction,
  ThirdPlacePrediction,
  UserProfile,
} from "./types";

export interface PickBackup {
  uid: string;
  teamName: string;
  /** When the player locked in (from their userLock doc), if known. */
  lockedAt: number | null;
  /** When this backup snapshot was written. */
  backedUpAt: number;
  matches: MatchPrediction[];
  groups: GroupPrediction[];
  thirdPlace: number[];
}

/**
 * Snapshot a single player's current picks into `pickBackups/{uid}`.
 * Returns false (and writes nothing) if the player has no match picks yet.
 */
export async function backupUserPicks(db: Firestore, uid: string): Promise<boolean> {
  const predRef = db.collection("predictions").doc(uid);
  const [mSnap, gSnap, tSnap, lockSnap, userSnap] = await Promise.all([
    predRef.collection("matches").get(),
    predRef.collection("groups").get(),
    predRef.collection("meta").doc("thirdPlace").get(),
    predRef.collection("meta").doc("userLock").get(),
    db.collection("users").doc(uid).get(),
  ]);

  const matches = mSnap.docs.map((d) => d.data() as MatchPrediction);
  if (matches.length === 0) return false;

  const groups = gSnap.docs.map((d) => d.data() as GroupPrediction);
  const thirdPlace = tSnap.exists
    ? ((tSnap.data() as ThirdPlacePrediction).advancing ?? [])
    : [];
  const lockedAt = lockSnap.exists
    ? ((lockSnap.data() as { lockedAt?: number }).lockedAt ?? null)
    : null;
  const teamName = userSnap.exists ? ((userSnap.data() as UserProfile).teamName ?? "") : "";

  const backup: PickBackup = {
    uid,
    teamName,
    lockedAt,
    backedUpAt: Date.now(),
    matches,
    groups,
    thirdPlace,
  };
  await db.collection("pickBackups").doc(uid).set(backup);
  return true;
}
