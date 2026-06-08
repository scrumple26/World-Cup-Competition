import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ScoreDoc, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/league — returns all users + scores (Admin SDK, no auth required). */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ users: [], scores: {} });

  const [uSnap, sSnap, mSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("scores").get(),
    db.collection("wcMatches").get(),
  ]);

  const users = uSnap.docs.map((d) => d.data() as UserProfile);
  const scores: Record<string, ScoreDoc> = {};
  sSnap.forEach((d) => {
    const s = d.data() as ScoreDoc;
    scores[s.uid] = s;
  });
  // Zero-fill any user with no score doc yet
  for (const u of users) {
    if (!scores[u.uid]) {
      scores[u.uid] = { uid: u.uid, groupPts: 0, knockoutPts: 0, total: 0, perfectScores: 0, perfectGroups: 0, history: [] };
    }
  }

  const playedStatuses = new Set(["FT", "AET", "PEN"]);
  let playedMatchCount = 0;
  const totalMatchCount = mSnap.size;
  for (const d of mSnap.docs) {
    if (playedStatuses.has((d.data() as { status: string }).status)) playedMatchCount++;
  }

  return NextResponse.json({ users, scores, playedMatchCount, totalMatchCount });
}
