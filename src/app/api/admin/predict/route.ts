import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import type { GroupPrediction, MatchPrediction, ThirdPlacePrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/predict — submit a prediction on behalf of a user.
 * { uid, type: "match"|"group"|"third", payload }
 * type=match  -> payload: MatchPrediction
 * type=group  -> payload: GroupPrediction
 * type=third  -> payload: ThirdPlacePrediction
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { uid, type, payload } = (await req.json()) as {
    uid: string;
    type: "match" | "group" | "third";
    payload: unknown;
  };
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const base = db.collection("predictions").doc(uid);
  if (type === "match") {
    const p = payload as MatchPrediction;
    await base.collection("matches").doc(String(p.fixtureId)).set(p, { merge: true });
  } else if (type === "group") {
    const p = payload as GroupPrediction;
    await base.collection("groups").doc(p.group).set(p);
  } else if (type === "third") {
    await base.collection("meta").doc("thirdPlace").set(payload as ThirdPlacePrediction);
  } else {
    return NextResponse.json({ error: "bad type" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
