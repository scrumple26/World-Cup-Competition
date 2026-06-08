import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { ensureFillTeams } from "@/lib/bots";
import { recomputeAllScores } from "@/lib/serverScoring";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/fill-teams  (admin only)
 * Fills any empty roster spots (up to 16) with random "Random Not Human FC"
 * bot teams. Does nothing once 16 real teams have signed up.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  try {
    const { created } = await ensureFillTeams(db);
    if (created > 0) await recomputeAllScores(db);
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
