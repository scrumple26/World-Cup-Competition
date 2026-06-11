import { NextRequest, NextResponse } from "next/server";
import { getFixtures } from "@/lib/apiFootball";
import { getAdminDb } from "@/lib/firebase/admin";
import { toWcMatch } from "@/lib/wcMap";
import type { WcMatch } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Last-synced fixtures from Firestore — used when the live API returns none. */
async function fixturesFromFirestore(round?: string): Promise<WcMatch[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const snap = await db.collection("wcMatches").get();
    let matches = snap.docs.map((d) => d.data() as WcMatch);
    if (round) matches = matches.filter((m) => m.round === round);
    return matches.sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * GET /api/wc/fixtures[?round=Group%20Stage%20-%201]
 * Returns Wc matches from API-Football (server-side; key stays hidden).
 *
 * Falls back to the last fixtures the sync job wrote to Firestore if the live
 * API call fails or returns nothing, so the app never loses its fixture list
 * (and therefore its group structure) over a transient API hiccup.
 */
export async function GET(req: NextRequest) {
  const round = req.nextUrl.searchParams.get("round") ?? undefined;
  let matches: WcMatch[] = [];
  try {
    matches = (await getFixtures(round)).map(toWcMatch);
  } catch {
    matches = [];
  }

  if (matches.length === 0) {
    matches = await fixturesFromFirestore(round);
  }

  return NextResponse.json({ count: matches.length, matches });
}
