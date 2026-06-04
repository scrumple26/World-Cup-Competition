import { NextRequest, NextResponse } from "next/server";
import { getMatchInsights } from "@/lib/apiFootball";

export const dynamic = "force-dynamic";

/** Simplified, client-safe insights derived from API-Football predictions. */
export interface MatchInsights {
  available: boolean;
  advice: string | null;
  winner: { name: string | null; comment: string | null };
  percent: { home: string; draw: string; away: string };
  goals: { home: string | number | null; away: string | number | null };
  comparison: Record<string, { home: string; away: string }>;
  teams: { home: string | null; away: string | null };
}

interface RawPrediction {
  predictions?: {
    winner?: { name?: string | null; comment?: string | null };
    advice?: string | null;
    goals?: { home?: string | number | null; away?: string | number | null };
    percent?: { home?: string; draw?: string; away?: string };
  };
  comparison?: Record<string, { home: string; away: string }>;
  teams?: { home?: { name?: string }; away?: { name?: string } };
}

/** GET /api/wc/match/:id/insights */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const fixtureId = Number(params.id);
  if (!Number.isFinite(fixtureId)) {
    return NextResponse.json({ error: "bad fixture id" }, { status: 400 });
  }
  try {
    const resp = (await getMatchInsights(fixtureId)) as RawPrediction[];
    const p = resp[0];
    const advice = p?.predictions?.advice ?? null;
    const out: MatchInsights = {
      available: !!advice && advice !== "No predictions available",
      advice,
      winner: {
        name: p?.predictions?.winner?.name ?? null,
        comment: p?.predictions?.winner?.comment ?? null,
      },
      percent: {
        home: p?.predictions?.percent?.home ?? "—",
        draw: p?.predictions?.percent?.draw ?? "—",
        away: p?.predictions?.percent?.away ?? "—",
      },
      goals: {
        home: p?.predictions?.goals?.home ?? null,
        away: p?.predictions?.goals?.away ?? null,
      },
      comparison: p?.comparison ?? {},
      teams: {
        home: p?.teams?.home?.name ?? null,
        away: p?.teams?.away?.name ?? null,
      },
    };
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
