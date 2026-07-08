import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isGroupRound } from "@/lib/wc";
import { hasOpenKnockoutFixtures } from "@/lib/wcMap";
import type { MatchPrediction, WcMatch } from "@/lib/types";

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

  const predRef = db.collection("predictions").doc(uid);

  const { predictions } = (await req.json().catch(() => ({}))) as {
    predictions?: MatchPrediction[];
  };

  if (!Array.isArray(predictions)) {
    return NextResponse.json({ error: "predictions array required" }, { status: 400 });
  }

  // Load knockout fixtures — used both to gate submission and to filter the payload.
  const wcSnap = await db.collection("wcMatches").get();
  const wcMatches = wcSnap.docs.map((d) => d.data() as WcMatch);
  const knockoutById = new Map<number, string>();
  for (const m of wcMatches) {
    if (typeof m.id === "number" && typeof m.round === "string" && !isGroupRound(m.round)) {
      knockoutById.set(m.id, m.round);
    }
  }

  // Only save knockout predictions (ignore any group-stage fixtures in the payload)
  if (knockoutById.size === 0) {
    return NextResponse.json({ error: "No knockout fixtures found — cannot lock in knockout picks." }, { status: 500 });
  }

  // The Finals picks window is open while any knockout fixture is still to kick
  // off. Also honour a legacy admin unlock marker if one is present.
  const koUnlockSnap = await predRef.collection("meta").doc("knockoutUnlock").get();
  if (!hasOpenKnockoutFixtures(wcMatches) && !koUnlockSnap.exists) {
    return NextResponse.json(
      { error: "Finals picks are closed — all knockout matches have kicked off." },
      { status: 403 },
    );
  }
  const knockoutPredictions = predictions.filter((p) => knockoutById.has(p.fixtureId));

  const missingTieWinners = knockoutPredictions.filter(
    (p) =>
      typeof p.home === "number" &&
      typeof p.away === "number" &&
      p.home === p.away &&
      p.predictedWinner !== "home" &&
      p.predictedWinner !== "away",
  );
  if (missingTieWinners.length > 0) {
    const round = knockoutById.get(missingTieWinners[0].fixtureId) ?? "knockout";
    return NextResponse.json(
      {
        error: `Draw predicted in ${round}. Pick a winner for ties (penalties/shootout) before submitting.`,
        missingTieWinnerFixtureIds: missingTieWinners.map((p) => p.fixtureId),
      },
      { status: 400 },
    );
  }

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

  // Clear any manual admin unlock marker (no-op if absent). While the Finals
  // window is open, picks stay editable; each match still locks at its kickoff.
  await predRef.collection("meta").doc("knockoutUnlock").delete();

  return NextResponse.json({ ok: true, count: knockoutPredictions.length });
}
