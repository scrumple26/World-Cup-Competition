import { NextRequest, NextResponse } from "next/server";
import { getFixtures } from "@/lib/apiFootball";
import { toWcMatch } from "@/lib/wcMap";

export const dynamic = "force-dynamic";

/**
 * GET /api/wc/fixtures[?round=Group%20Stage%20-%201]
 * Returns Wc matches from API-Football (server-side; key stays hidden).
 */
export async function GET(req: NextRequest) {
  const round = req.nextUrl.searchParams.get("round") ?? undefined;
  try {
    const fixtures = await getFixtures(round);
    const matches = fixtures.map(toWcMatch);
    return NextResponse.json({ count: matches.length, matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
