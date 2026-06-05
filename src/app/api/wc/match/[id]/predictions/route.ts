import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { MatchPrediction, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export type MatchPredictionEntry = {
  uid: string;
  firstName: string;
  lastName: string;
  teamName: string;
  logoUrl?: string;
  home: number;
  away: number;
};

/**
 * GET /api/wc/match/[id]/predictions
 * Returns every user's prediction for a fixture. Client enforces visibility gating.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const fixtureId = Number(params.id);
  if (!fixtureId) return NextResponse.json({ predictions: [] });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ predictions: [] });

  const usersSnap = await db.collection("users").get();

  const entries = (
    await Promise.all(
      usersSnap.docs.map(async (userDoc) => {
        const predSnap = await db
          .collection("predictions")
          .doc(userDoc.id)
          .collection("matches")
          .doc(String(fixtureId))
          .get();
        if (!predSnap.exists) return null;
        const pred = predSnap.data() as MatchPrediction;
        const u = userDoc.data() as UserProfile;
        return {
          uid: userDoc.id,
          firstName: u.firstName,
          lastName: u.lastName,
          teamName: u.teamName,
          logoUrl: u.logoUrl,
          home: pred.home,
          away: pred.away,
        } satisfies MatchPredictionEntry;
      }),
    )
  ).filter(Boolean) as MatchPredictionEntry[];

  return NextResponse.json({ predictions: entries });
}
