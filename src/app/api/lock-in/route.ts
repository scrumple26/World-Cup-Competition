import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { MatchPrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/lock-in   { predictions: MatchPrediction[] }
 * Saves all predictions in one Admin SDK batch and marks the user as locked in.
 * Uses Admin SDK so there are no Firestore client auth timing issues.
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

  const { predictions } = (await req.json().catch(() => ({}))) as {
    predictions?: MatchPrediction[];
  };

  if (!Array.isArray(predictions)) {
    return NextResponse.json({ error: "predictions array required" }, { status: 400 });
  }

  // Batch write — Admin SDK handles up to 500 per batch
  const BATCH_SIZE = 400;
  for (let i = 0; i < predictions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const pred of predictions.slice(i, i + BATCH_SIZE)) {
      batch.set(
        db.collection("predictions").doc(uid).collection("matches").doc(String(pred.fixtureId)),
        { ...pred, userLocked: true },
        { merge: true },
      );
    }
    await batch.commit();
  }

  // Mark user as locked in
  await db.collection("predictions").doc(uid).collection("meta").doc("userLock").set({
    lockedAt: Date.now(),
  });

  // Clear the cross-device draft now that picks are committed.
  await db.collection("predictions").doc(uid).collection("meta").doc("draft").delete().catch(() => {});

  return NextResponse.json({ ok: true, count: predictions.length });
}
