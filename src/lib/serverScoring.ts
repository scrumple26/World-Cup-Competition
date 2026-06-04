import "server-only";

import type { Firestore } from "firebase-admin/firestore";

/**
 * Recompute every user's score from cached WC results + their predictions,
 * writing `scores/{uid}` and appending to the cumulative history.
 *
 * NOTE: full implementation lands in Phase 5 (scoring recompute). For now this
 * is a no-op placeholder so the sync route compiles and runs; it returns the
 * number of users that *would* be scored.
 */
export async function recomputeAllScores(db: Firestore): Promise<number> {
  const users = await db.collection("users").get();
  // TODO(Phase 5): for each user, load predictions + results, apply the scoring
  // engine, and persist scores/{uid} with history points keyed by matchday.
  return users.size;
}
