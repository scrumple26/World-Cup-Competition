import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { getLiveFixtures, getMatchEvents, getMatchStatistics } from "@/lib/apiFootball";
import { generatePunditCommentary, type CommentaryContext, type StatLeaderLine } from "@/lib/commentary";
import type { MatchScorer } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

function leader(label: string, home: number, away: number, suffix?: string): StatLeaderLine {
  return { label, home, away, leader: home > away ? "home" : away > home ? "away" : "even", suffix };
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return Number(String(v).replace("%", "")) || 0;
}

/** A fabricated dramatic match so admins can preview the pundit desk pre-tournament. */
function sampleContext(): CommentaryContext {
  return {
    homeTeam: "USA",
    awayTeam: "Mexico",
    homeScore: 2,
    awayScore: 1,
    scorers: [
      { side: "away", player: "Raúl Jiménez", minute: 23, kind: "goal" },
      { side: "home", player: "Christian Pulisic", minute: 61, kind: "goal" },
      { side: "home", player: "Folarin Balogun", minute: 89, kind: "goal" },
    ],
    statLeaders: [
      leader("Possession", 47, 53, "%"),
      leader("Shots", 14, 9),
      leader("Shots on Target", 6, 3),
      leader("Corners", 7, 4),
      leader("Pass Accuracy", 84, 88, "%"),
    ],
    lateDrama: {
      elapsed: 89,
      scoringTeam: "USA",
      lostPerfect: ["Penalty Box Pros"],
      gainedPerfect: ["Last Minute Heroes"],
      lostOutcome: [],
      gainedOutcome: ["VAR Wars"],
      varInvolved: true,
    },
    perfectPickers: ["Last Minute Heroes"],
    lateSwingNote: "89' winner flipped two perfect picks",
  };
}

async function fixtureContext(fixtureId: number): Promise<CommentaryContext | null> {
  const [fixtures, events, statsRaw] = await Promise.all([
    getLiveFixtures([fixtureId]),
    getMatchEvents(fixtureId).catch(() => []),
    getMatchStatistics(fixtureId).catch(() => []),
  ]);
  const fx = fixtures[0];
  if (!fx) return null;
  const homeId = fx.teams.home.id;

  const scorers: MatchScorer[] = events
    .filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty")
    .map((e) => ({
      side: e.team.id === homeId ? "home" : "away",
      player: e.player.name ?? "Unknown",
      minute: e.time.elapsed + (e.time.extra ?? 0),
      kind: e.detail === "Own Goal" ? "owngoal" : e.detail.includes("Penalty") ? "penalty" : "goal",
    }));

  const statLeaders: StatLeaderLine[] = [];
  if (statsRaw.length >= 2) {
    const home = statsRaw.find((s) => s.team.id === homeId)?.statistics ?? [];
    const away = statsRaw.find((s) => s.team.id !== homeId)?.statistics ?? [];
    const val = (arr: typeof home, key: string) => num(arr.find((x) => x.type === key)?.value ?? 0);
    statLeaders.push(leader("Possession", val(home, "Ball Possession"), val(away, "Ball Possession"), "%"));
    statLeaders.push(leader("Shots", val(home, "Total Shots"), val(away, "Total Shots")));
    statLeaders.push(leader("Shots on Target", val(home, "Shots on Goal"), val(away, "Shots on Goal")));
    statLeaders.push(leader("Corners", val(home, "Corner Kicks"), val(away, "Corner Kicks")));
  }

  return {
    homeTeam: fx.teams.home.name,
    awayTeam: fx.teams.away.name,
    homeScore: fx.goals.home ?? 0,
    awayScore: fx.goals.away ?? 0,
    scorers,
    statLeaders,
    perfectPickers: [],
  };
}

/**
 * POST /api/admin/commentary — admin-only pundit commentary tester.
 * Body: { sample: true } or { fixtureId: number }. Returns { commentary, context }.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { sample?: boolean; fixtureId?: number };

  let ctx: CommentaryContext | null;
  if (body.fixtureId) {
    ctx = await fixtureContext(Number(body.fixtureId));
    if (!ctx) return NextResponse.json({ error: "fixture not found or has no data yet" }, { status: 404 });
  } else {
    ctx = sampleContext();
  }

  const commentary = await generatePunditCommentary(ctx);
  return NextResponse.json({ commentary, context: ctx, hasKey: !!process.env.GEMINI_API_KEY });
}
