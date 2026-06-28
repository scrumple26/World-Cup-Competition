import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isGroupRound } from "@/lib/wc";
import type { MatchPrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/lock-in-knockout   { predictions: MatchPrediction[] }
 * Saves knockout-round predictions and removes the knockoutUnlock meta doc,
 * re-locking the knockout stage for this user.
 * Requires an active Firebase session (the user must be knockout-unlocked).
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Verify the user is actually knockout-unlocked
  const predRef = db.collection("predictions").doc(uid);
  const koUnlockSnap = await predRef.collection("meta").doc("knockoutUnlock").get();
  if (!koUnlockSnap.exists) {
    return NextResponse.json(
      { error: "Knockout picks are not unlocked for this user." },
      { status: 403 },
    );
  }

  const { predictions } = (await req.json().catch(() => ({}))) as {
    predictions?: MatchPrediction[];
  };

  if (!Array.isArray(predictions)) {
    return NextResponse.json({ error: "predictions array required" }, { status: 400 });
  }

  // Determine which fixtures are knockout rounds by checking wcMatches
  const wcSnap = await db.collection("wcMatches").get();
  const knockoutIds = new Set<number>();
  for (const d of wcSnap.docs) {
    const m = d.data() as { id?: number; round?: string };
    if (typeof m.id === "number" && typeof m.round === "string" && !isGroupRound(m.round)) {
      knockoutIds.add(m.id);
    }
  }

  // Only save knockout predictions (ignore any group-stage fixtures in the payload)
  const knockoutPredictions = predictions.filter(
    (p) => knockoutIds.size === 0 || knockoutIds.has(p.fixtureId),
  );

  // Batch write knockout predictions
  const BATCH_SIZE = 400;
  for (let i = 0; i < knockoutPredictions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const pred of knockoutPredictions.slice(i, i + BATCH_SIZE)) {
      batch.set(
        predRef.collection("matches").doc(String(pred.fixtureId)),
        { ...pred, userLocked: true },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // Remove the knockoutUnlock doc — user's knockout picks are now locked in again
  await predRef.collection("meta").doc("knockoutUnlock").delete();

  return NextResponse.json({ ok: true, count: knockoutPredictions.length });
}
