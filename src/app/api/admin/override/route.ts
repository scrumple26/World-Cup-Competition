import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { recomputeAllScores } from "@/lib/serverScoring";
import type { Outcome } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/override
 * { fixtureId, home, away, decidedWinner? } — correct a match result. Marks the
 * match manualOverride so sync won't clobber it, then recomputes scores.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { fixtureId, home, away, decidedWinner } = (await req.json()) as {
    fixtureId: number;
    home: number;
    away: number;
    decidedWinner?: Outcome;
  };
  if (!fixtureId || home == null || away == null) {
    return NextResponse.json({ error: "fixtureId, home, away required" }, { status: 400 });
  }

  await db.collection("wcMatches").doc(String(fixtureId)).set(
    {
      goals: { home, away },
      status: "FT",
      manualOverride: true,
      ...(decidedWinner ? { decidedWinner } : {}),
    },
    { merge: true },
  );
  const scored = await recomputeAllScores(db);
  return NextResponse.json({ ok: true, usersScored: scored });
}
