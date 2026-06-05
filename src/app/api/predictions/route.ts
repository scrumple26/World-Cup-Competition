import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { GroupPrediction, MatchPrediction, ThirdPlacePrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/predictions?uid=...
 * Returns all predictions for a given user (Admin SDK, no auth required for reads).
 */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ matches: {}, groups: {}, third: { advancing: [] } });

  const [mSnap, gSnap, tSnap, lockSnap] = await Promise.all([
    db.collection("predictions").doc(uid).collection("matches").get(),
    db.collection("predictions").doc(uid).collection("groups").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("thirdPlace").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("userLock").get(),
  ]);

  const matches: Record<number, MatchPrediction> = {};
  mSnap.forEach((d) => {
    const p = d.data() as MatchPrediction;
    matches[p.fixtureId] = p;
  });

  const groups: Record<string, GroupPrediction> = {};
  gSnap.forEach((d) => {
    const p = d.data() as GroupPrediction;
    groups[p.group] = p;
  });

  const third: ThirdPlacePrediction = tSnap.exists
    ? (tSnap.data() as ThirdPlacePrediction)
    : { advancing: [] };

  return NextResponse.json({ matches, groups, third, userLocked: lockSnap.exists });
}
