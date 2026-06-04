import { NextRequest, NextResponse } from "next/server";
import { getFixtures } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";

/**
 * GET /api/wc/fixtures[?round=Group%20Stage%20-%201]
 * Returns compact WC fixtures from API-Football (server-side; key stays hidden).
 */
export async function GET(req: NextRequest) {
  const round = req.nextUrl.searchParams.get("round") ?? undefined;
  try {
    const fixtures = await getFixtures(round);
    const compact = fixtures.map((f) => ({
      id: f.fixture.id,
      date: f.fixture.date,
      status: f.fixture.status.short,
      round: f.league.round,
      home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
      away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
      goals: f.goals,
    }));
    return NextResponse.json({ count: compact.length, fixtures: compact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
