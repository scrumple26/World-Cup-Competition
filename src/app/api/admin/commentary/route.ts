import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { getLiveFixtures, getMatchEvents, getMatchStatistics } from "@/lib/apiFootball";
import { generatePunditCommentary, type CommentaryContext, type StatLeaderLine } from "@/lib/commentary";
import { stakesForRound } from "@/lib/wc";
import type { MatchScorer } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

function leader(label: string, home: number, away: number, suffix?: string): StatLeaderLine {
  return { label, home, away, leader: home > away ? "home" : away > home ? "away" : "even", suffix };
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return Number(String(v).replace("%", "")) || 0;
}

const SAMPLE_TEAMS = [
  "Galaxy Strikers", "Penalty Box Pros", "Last Minute Heroes", "VAR Wars",
  "Golden Boot Crew", "Midfield Maestros", "Group of Death", "Stoppage Time FC",
];
const USA_PLAYERS = ["Christian Pulisic", "Folarin Balogun", "Tim Weah", "Gio Reyna", "Weston McKennie"];
const SEN_PLAYERS = ["Nicolas Jackson", "Ismaïla Sarr", "Boulaye Dia", "Sadio Mané", "Krépin Diatta"];

function rint(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function pickN<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}
function scorersFor(side: "home" | "away", names: string[], count: number, lateMinute?: number): MatchScorer[] {
  const picked = pickN(names, Math.min(count, names.length));
  return picked.map((player, i): MatchScorer => ({
    side, player,
    minute: i === picked.length - 1 && lateMinute ? lateMinute : rint(5, 80),
    kind: Math.random() < 0.15 ? "penalty" : "goal",
  })).sort((a, b) => a.minute - b.minute);
}

/** A randomized USA-vs-Senegal friendly so admins can preview the pundit desk
 *  pre-tournament — different predictions/drama each time. */
function sampleContext(): CommentaryContext {
  const homeScore = rint(1, 3);
  const awayScore = rint(0, 2);
  const lateMin = rint(85, 92);
  const homeLate = homeScore >= awayScore; // USA grabs the late one when winning/level
  const scoringTeam = homeLate ? "USA" : "Senegal";
  const varInvolved = Math.random() < 0.5;

  const [lost] = pickN(SAMPLE_TEAMS, 1);
  const rest = SAMPLE_TEAMS.filter((t) => t !== lost);
  const [gained, gainedOut] = pickN(rest, 2);
  const perfectPickers = pickN(rest.filter((t) => t !== gained && t !== gainedOut), rint(1, 2));

  // Randomize stakes each preview so admins can see how the desk's intensity shifts.
  const sampleRound = pickN(["Group Stage - 1", "Group Stage - 3", "Round of 16"], 1)[0];

  return {
    homeTeam: "USA",
    awayTeam: "Senegal",
    round: sampleRound,
    stakes: stakesForRound(sampleRound),
    homeScore,
    awayScore,
    scorers: [
      ...scorersFor("home", USA_PLAYERS, homeScore, homeLate ? lateMin : undefined),
      ...scorersFor("away", SEN_PLAYERS, awayScore, homeLate ? undefined : lateMin),
    ].sort((a, b) => a.minute - b.minute),
    statLeaders: [
      leader("Possession", rint(40, 60), 0, "%"),
      leader("Shots", rint(8, 18), rint(5, 14)),
      leader("Shots on Target", rint(3, 8), rint(2, 6)),
      leader("Corners", rint(2, 9), rint(2, 8)),
      leader("Pass Accuracy", rint(78, 90), rint(76, 90), "%"),
    ].map((s) => (s.label === "Possession" ? { ...s, away: 100 - s.home, leader: s.home > 50 ? "home" : "away" } as typeof s : s)),
    lateDrama: {
      elapsed: lateMin,
      scoringTeam,
      lostPerfect: [lost],
      gainedPerfect: [gained],
      lostOutcome: [],
      gainedOutcome: [gainedOut],
      varInvolved,
    },
    perfectPickers,
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
    round: fx.league.round,
    stakes: stakesForRound(fx.league.round),
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
