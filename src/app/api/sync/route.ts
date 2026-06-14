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

  // Light mode (cron: ?light=1): refresh results + recompute scores only, and
  // SKIP Gemini feed generation. Runs frequently so scores/standings/charts
  // track live games and finished matches promptly, without re-hammering the
  // AI feed step. The full sync (with feed) runs on a slower cadence.
  const light = req.nextUrl.searchParams.get("light") === "1";

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
      const data = d.data() as { manualOverride?: boolean };
      if (data.manualOverride) manualOverrides.add(d.id);
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

    // 7. Generate feed entries (recap + pundit + result tweets). Target every
    //    completed match that is MISSING a complete feed entry — not just ones
    //    that flipped to FT this run — so a single sync backfills anything an
    //    earlier run missed (e.g. a transient Firestore-quota failure). The set
    //    write in generateFeedEntries is idempotent, so re-running is safe.
    //    Non-critical: never let this block or fail the sync.
    const playedStatuses = new Set(["FT", "AET", "PEN"]);
    let feedCount = 0;
    if (!light) {
      try {
        const [usersSnap, feedSnap] = await Promise.all([
          db.collection("users").get(),
          db.collection("feedEntries").get(),
        ]);
        const completeFeedIds = new Set(
          feedSnap.docs
            .filter((d) => {
              const e = d.data() as { commentary?: unknown[] };
              return Array.isArray(e.commentary) && e.commentary.length > 0;
            })
            .map((d) => d.id),
        );
        const needsFeed = wcMatches.filter(
          (m) => playedStatuses.has(m.status) && !completeFeedIds.has(String(m.id)),
        );
        feedCount = await generateFeedEntries(db, needsFeed, usersSnap);
      } catch (e) {
        console.error("[sync] feed generation failed (scores still updated):", e);
      }
    }

    return NextResponse.json({
      ok: true,
      light,
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
