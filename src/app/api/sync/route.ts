import { NextRequest, NextResponse } from "next/server";
import { getFixtures, getStandings } from "@/lib/apiFootball";
import { getAdminDb } from "@/lib/firebase/admin";
import { toWcMatch, toGroupStandings } from "@/lib/wcMap";
import { recomputeAllScores } from "@/lib/serverScoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST/GET /api/sync — refresh WC fixtures + standings into Firestore and
 * recompute everyone's scores. Triggered by Vercel Cron (Authorization:
 * Bearer <CRON_SECRET>) or by an admin. Admin-set results (manualOverride)
 * are preserved.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const keyParam = req.nextUrl.searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && keyParam !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin not configured — sync requires Firestore." },
      { status: 503 },
    );
  }

  // 1. Fixtures → wcMatches (preserve manual overrides)
  const fixtures = await getFixtures();
  let matchWrites = 0;
  const batchSize = 400;
  for (let i = 0; i < fixtures.length; i += batchSize) {
    const batch = db.batch();
    for (const f of fixtures.slice(i, i + batchSize)) {
      const m = toWcMatch(f);
      const ref = db.collection("wcMatches").doc(String(m.id));
      const snap = await ref.get();
      if (snap.exists && (snap.data() as { manualOverride?: boolean }).manualOverride) {
        continue; // don't clobber admin-corrected results
      }
      batch.set(ref, m, { merge: true });
      matchWrites++;
    }
    await batch.commit();
  }

  // 2. Standings → wcStandings/{letter}
  const standings = toGroupStandings(await getStandings());
  const sBatch = db.batch();
  for (const g of standings) {
    const letter = g.group.replace("Group ", "");
    sBatch.set(db.collection("wcStandings").doc(letter), g);
  }
  await sBatch.commit();

  // 3. Recompute scores from latest results
  const scored = await recomputeAllScores(db);

  return NextResponse.json({
    ok: true,
    matchesSynced: matchWrites,
    groupsSynced: standings.length,
    usersScored: scored,
  });
}

export const GET = handle;
export const POST = handle;
