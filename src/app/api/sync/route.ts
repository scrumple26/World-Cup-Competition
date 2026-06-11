import { NextRequest, NextResponse } from "next/server";
import { getFixtures, getStandings } from "@/lib/apiFootball";
import { getAdminDb } from "@/lib/firebase/admin";
import { toWcMatch, toGroupStandings } from "@/lib/wcMap";
import { recomputeAllScores, autoFillMissingPredictions } from "@/lib/serverScoring";
import { ensureFillTeams } from "@/lib/bots";
import { generateFeedEntries } from "@/lib/feedGen";
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
    const prevStatuses = new Map<string, string>();
    for (const d of existingSnap.docs) {
      const data = d.data() as { manualOverride?: boolean; status?: string };
      if (data.manualOverride) manualOverrides.add(d.id);
      if (data.status) prevStatuses.set(d.id, data.status);
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

    // 5. Auto-fill missing predictions for any match whose kickoff has passed
    const wcMatches = fixtures.map(toWcMatch);
    const autoFilled = await autoFillMissingPredictions(db, wcMatches);

    // 5b. Once the lock-in deadline (first group-stage kickoff) has passed, fill
    //     any empty roster spots with random bot teams so the field has 16.
    try {
      const firstKickoff = wcMatches
        .filter((m) => m.round.startsWith("Group Stage"))
        .map((m) => m.kickoff)
        .sort()[0];
      if (firstKickoff && new Date().toISOString() >= firstKickoff) {
        await ensureFillTeams(db);
      }
    } catch (e) {
      console.error("[sync] fill-teams failed:", e);
    }

    // 6. Recompute everyone's scores from the latest results. This is the core
    //    job — it must run even if the cosmetic feed/AI step below fails or hits
    //    a Firestore quota, so it goes BEFORE feed generation (and feed is
    //    wrapped). Otherwise a feed failure would leave every score at 0.
    const scored = await recomputeAllScores(db);

    // 7. Generate feed entries for matches that just became FT/AET/PEN this sync.
    //    Non-critical: never let this block or fail the sync.
    const playedStatuses = new Set(["FT", "AET", "PEN"]);
    const newlyCompleted = wcMatches.filter(
      (m) => playedStatuses.has(m.status) && !playedStatuses.has(prevStatuses.get(String(m.id)) ?? ""),
    );
    let feedCount = 0;
    try {
      const usersSnap = await db.collection("users").get();
      feedCount = await generateFeedEntries(db, newlyCompleted, usersSnap);
    } catch (e) {
      console.error("[sync] feed generation failed (scores still updated):", e);
    }

    return NextResponse.json({
      ok: true,
      matchesSynced: matchWrites,
      groupsSynced: standings.length,
      autoFilled,
      feedEntries: feedCount,
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
