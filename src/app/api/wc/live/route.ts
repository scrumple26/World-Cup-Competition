import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getLiveFixtures } from "@/lib/apiFootball";
import { toWcMatch } from "@/lib/wcMap";

export const dynamic = "force-dynamic";

/**
 * GET /api/wc/live?ids=123,456,789
 * Returns real-time fixture data for the given IDs (30s server-side cache).
 * Called by the Schedule page to poll live scores every minute.
 */
export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("ids");
  if (!param) return NextResponse.json({ matches: [] });

  const ids = param
    .split(",")
    .map(Number)
    .filter((n) => n > 0)
    .slice(0, 20);

  if (ids.length === 0) return NextResponse.json({ matches: [] });

  try {
    const fixtures = await getLiveFixtures(ids);
    return NextResponse.json({ matches: fixtures.map(toWcMatch) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
