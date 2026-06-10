import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getLiveFixtures, getMatchEvents, getMatchStatistics } from "@/lib/apiFootball";
import { toWcMatch } from "@/lib/wcMap";

export const dynamic = "force-dynamic";

export type LiveEvent = {
  minute: number;
  extraMinute: number | null;
  teamSide: "home" | "away";
  type: "goal" | "owngoal" | "penalty" | "yellowcard" | "redcard" | "yellowredcard" | "sub" | "var" | "other";
  player: string;
  assist: string | null;
};

export type LiveStats = {
  home: StatSide;
  away: StatSide;
};

export type StatSide = {
  possession: string;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  saves: number;
  passes: number;
  passAccuracy: number; // percentage 0–100
};

export type LiveMatchDetails = {
  fixtureId: number;
  status: string;
  elapsed: number | null;
  homeTeamId: number;
  awayTeamId: number;
  goals: { home: number | null; away: number | null };
  events: LiveEvent[];
  stats: LiveStats | null;
};

function classifyEvent(type: string, detail: string): LiveEvent["type"] {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();
  if (t === "goal") {
    if (d.includes("own")) return "owngoal";
    if (d.includes("penalty")) return "penalty";
    return "goal";
  }
  if (t === "card") {
    if (d.includes("red card") && d.includes("yellow")) return "yellowredcard";
    if (d.includes("red")) return "redcard";
    return "yellowcard";
  }
  if (t === "subst") return "sub";
  if (t === "var") return "var";
  return "other";
}

function statVal(stats: { type: string; value: number | string | null }[], key: string): number {
  const entry = stats.find((s) => s.type === key);
  if (!entry || entry.value === null) return 0;
  const v = typeof entry.value === "string" ? entry.value.replace("%", "") : entry.value;
  return Number(v) || 0;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const fixtureId = Number(params.id);
  if (!fixtureId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [fixtures, events, statsRaw] = await Promise.all([
      getLiveFixtures([fixtureId]),
      getMatchEvents(fixtureId),
      getMatchStatistics(fixtureId).catch(() => []),
    ]);

    const fixture = fixtures[0];
    if (!fixture) return NextResponse.json({ error: "Fixture not found" }, { status: 404 });

    const match = toWcMatch(fixture);
    const homeId = fixture.teams.home.id;
    const awayId = fixture.teams.away.id;

    const liveEvents: LiveEvent[] = events.map((e) => ({
      minute: e.time.elapsed,
      extraMinute: e.time.extra ?? null,
      teamSide: e.team.id === homeId ? "home" : "away",
      type: classifyEvent(e.type, e.detail),
      player: e.player.name ?? "Unknown",
      assist: e.assist.name ?? null,
    }));

    // Parse statistics
    let stats: LiveStats | null = null;
    if (statsRaw.length >= 2) {
      const sides = [statsRaw[0], statsRaw[1]];
      const home = sides.find((s) => s.team.id === homeId)?.statistics ?? [];
      const away = sides.find((s) => s.team.id === awayId)?.statistics ?? [];
      const parseSide = (s: typeof home): StatSide => {
        const passesTotal = statVal(s, "Total passes");
        const passesAccurate = statVal(s, "Passes accurate");
        // API gives "Passes %" as e.g. "85%"; fall back to accurate/total.
        let passAccuracy = statVal(s, "Passes %");
        if (!passAccuracy && passesTotal > 0) {
          passAccuracy = Math.round((passesAccurate / passesTotal) * 100);
        }
        return {
          possession:    String(s.find((x) => x.type === "Ball Possession")?.value ?? "0%"),
          shots:         statVal(s, "Total Shots"),
          shotsOnTarget: statVal(s, "Shots on Goal"),
          corners:       statVal(s, "Corner Kicks"),
          fouls:         statVal(s, "Fouls"),
          yellowCards:   statVal(s, "Yellow Cards"),
          redCards:      statVal(s, "Red Cards"),
          offsides:      statVal(s, "Offsides"),
          saves:         statVal(s, "Goalkeeper Saves"),
          passes:        passesTotal,
          passAccuracy,
        };
      };
      stats = { home: parseSide(home), away: parseSide(away) };
    }

    const details: LiveMatchDetails = {
      fixtureId,
      status: match.status,
      elapsed: match.elapsed ?? null,
      homeTeamId: homeId,
      awayTeamId: awayId,
      goals: match.goals,
      events: liveEvents,
      stats,
    };

    return NextResponse.json(details);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
