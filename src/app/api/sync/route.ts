import { NextRequest, NextResponse } from "next/server";
import { getFixtures, getStandings } from "@/lib/apiFootball";
import { getAdminDb } from "@/lib/firebase/admin";
import { toWcMatch, toGroupStandings } from "@/lib/wcMap";
import { recomputeAllScores } from "@/lib/serverScoring";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // generous for 104-fixture sync + 16-user scoring

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
  const secretOk = secret && (auth === `Bearer ${secret}` || keyParam === secret);
  if (!secretOk && !(await requireAdmin(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json(
      { error: "Firebase Admin not configured — sync requires Firestore." },
      { status: 503 },
    );
  }

  try {
    // 1. Fetch from API-Football — bail early if either call returns empty.
    const [fixtures, rawStandings] = await Promise.all([
      getFixtures(),
      getStandings(),
    ]);

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json(
        { error: "API-Football returned no fixtures — aborting to protect existing data." },
        { status: 502 },
      );
    }

    // 2. Pre-fetch all existing wcMatch docs in ONE read to check manualOverride,
    //    avoiding 104 sequential reads inside the batch loop.
    const existingSnap = await db.collection("wcMatches").get();
    const manualOverrides = new Set<string>();
    for (const d of existingSnap.docs) {
      if ((d.data() as { manualOverride?: boolean }).manualOverride) {
        manualOverrides.add(d.id);
      }
    }

    // 3. Write fixtures → wcMatches (skip manual overrides)
    const batchSize = 400;
    let matchWrites = 0;
    for (let i = 0; i < fixtures.length; i += batchSize) {
      const batch = db.batch();
      for (const f of fixtures.slice(i, i + batchSize)) {
        const m = toWcMatch(f);
        if (manualOverrides.has(String(m.id))) continue;
        batch.set(db.collection("wcMatches").doc(String(m.id)), m, { merge: true });
        matchWrites++;
      }
      await batch.commit();
    }

    // 4. Write standings → wcStandings (only if non-empty)
    const standings = toGroupStandings(rawStandings);
    if (standings.length > 0) {
      const sBatch = db.batch();
      for (const g of standings) {
        const letter = g.group.replace("Group ", "");
        sBatch.set(db.collection("wcStandings").doc(letter), g);
      }
      await sBatch.commit();
    }

    // 5. Recompute everyone's scores from the latest results
    const scored = await recomputeAllScores(db);

    return NextResponse.json({
      ok: true,
      matchesSynced: matchWrites,
      groupsSynced: standings.length,
      usersScored: scored,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sync error";
    console.error("[sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
