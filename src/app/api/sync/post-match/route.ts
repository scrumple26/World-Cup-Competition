import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getLiveFixtures } from "@/lib/apiFootball";
import { toWcMatch } from "@/lib/wcMap";
import { recomputeAllScores, autoFillMissingPredictions } from "@/lib/serverScoring";
import { generateFeedEntries } from "@/lib/feedGen";
import type { WcMatch } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COOLDOWN_MS = 4 * 60 * 1000; // 4 minutes between auto-syncs

/**
 * POST /api/sync/post-match  { fixtureId?: number }
 *
 * Called by the live-score poller when it detects a match has ended.
 * No auth required — protected by a Firestore-stored cooldown.
 */
export async function POST(req: NextRequest) {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "no db" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as { fixtureId?: number };

  // Cooldown check — prevents 16 connected users all triggering at once
  const metaRef = db.collection("meta").doc("autoSync");
  const metaSnap = await metaRef.get();
  const last = metaSnap.exists
    ? (metaSnap.data() as { lastTriggered?: string }).lastTriggered
    : null;
  if (last && Date.now() - new Date(last).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ skipped: true, reason: "cooldown" });
  }

  // Stamp the trigger time immediately so concurrent calls get bounced
  await metaRef.set({ lastTriggered: new Date().toISOString() }, { merge: true });

  try {
    // Refresh the specific fixture in Firestore so scoring has fresh data
    if (body.fixtureId) {
      const fixtures = await getLiveFixtures([body.fixtureId]);
      if (fixtures.length > 0) {
        const m = toWcMatch(fixtures[0]);
        // Only update if not a manual override
        const existing = await db.collection("wcMatches").doc(String(m.id)).get();
        if (!(existing.data() as { manualOverride?: boolean } | undefined)?.manualOverride) {
          await db.collection("wcMatches").doc(String(m.id)).set(m, { merge: true });
        }
      }
    }

    // Load all wcMatches + existing feed ids
    const [wcSnap, feedSnap] = await Promise.all([
      db.collection("wcMatches").get(),
      db.collection("feedEntries").get(),
    ]);
    const wcMatches = wcSnap.docs.map((d) => d.data() as WcMatch);
    // A feed entry only "counts" as done once it has commentary — so a match
    // whose earlier generation failed (empty/partial entry) is regenerated.
    const completeFeedIds = new Set(
      feedSnap.docs
        .filter((d) => {
          const e = d.data() as { commentary?: unknown[] };
          return Array.isArray(e.commentary) && e.commentary.length > 0;
        })
        .map((d) => d.id),
    );
    const playedStatuses = new Set(["FT", "AET", "PEN"]);
    const needsFeed = wcMatches.filter(
      (m) => playedStatuses.has(m.status) && !completeFeedIds.has(String(m.id)),
    );

    // Nothing newly completed → no scores can have changed. Skip the heavy
    // auto-fill + feed + full recompute entirely. (The 3-hour cron still does a
    // periodic full recompute as a safety net.)
    if (needsFeed.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no newly completed matches" });
    }

    // Recompute scores first — it's the core job and must not be blocked by the
    // cosmetic feed/AI step (which can throw or hit a Firestore quota).
    const autoFilled = await autoFillMissingPredictions(db, wcMatches);
    const scored = await recomputeAllScores(db);

    // Feed generation is non-critical: never let it fail the sync.
    let feedCount = 0;
    try {
      const usersSnap = await db.collection("users").get();
      feedCount = await generateFeedEntries(db, needsFeed, usersSnap);
    } catch (e) {
      console.error("[post-match sync] feed generation failed (scores still updated):", e);
    }

    return NextResponse.json({ ok: true, autoFilled, feedCount, usersScored: scored });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[post-match sync] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
