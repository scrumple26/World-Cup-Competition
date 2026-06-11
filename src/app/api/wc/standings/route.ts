import { NextResponse } from "next/server";
import { getStandings } from "@/lib/apiFootball";
import { getAdminDb } from "@/lib/firebase/admin";
import { toGroupStandings, type WcGroupStanding } from "@/lib/wcMap";

export const dynamic = "force-dynamic";

/** Last-synced standings from Firestore — used when the live API returns none. */
async function standingsFromFirestore(): Promise<WcGroupStanding[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const snap = await db.collection("wcStandings").get();
    return snap.docs
      .map((d) => d.data() as WcGroupStanding)
      .filter((g) => /^Group [A-Z]$/.test(g.group))
      .sort((a, b) => a.group.localeCompare(b.group));
  } catch {
    return [];
  }
}

/**
 * GET /api/wc/standings → the WC group tables.
 *
 * API-Football's standings endpoint can return empty (early in the tournament,
 * or transient failures). The group structure is load-bearing — predictions
 * build their groups from it — so when the live call yields nothing, fall back
 * to the last standings the sync job wrote to Firestore.
 */
export async function GET() {
  let live: WcGroupStanding[] = [];
  try {
    live = toGroupStandings(await getStandings());
  } catch {
    live = [];
  }

  if (live.length > 0) {
    return NextResponse.json({ groups: live });
  }

  const cached = await standingsFromFirestore();
  return NextResponse.json({ groups: cached });
}
