import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import {
  generateTweets, generatePreMatchTweets, generateHalftimeTweets,
  type TweetContext, type PreMatchTweetContext, type HalftimeTweetContext, type PreMatchPick,
} from "@/lib/social";

export const dynamic = "force-dynamic";

const TEAMS = ["Galaxy Strikers", "Penalty Box Pros", "Last Minute Heroes", "VAR Wars", "Golden Boot Crew", "Midfield Maestros"];
const SAMPLE_MANAGERS: Record<string, string> = {
  "Galaxy Strikers": "Alex", "Penalty Box Pros": "Sam", "Last Minute Heroes": "Jordan",
  "VAR Wars": "Casey", "Golden Boot Crew": "Taylor", "Midfield Maestros": "Morgan",
};
const SAMPLE_STRUGGLERS = [
  { team: "VAR Wars", manager: "Casey", reason: "rooted to the bottom of Group A" },
  { team: "Midfield Maestros", manager: "Morgan", reason: "4 straight matches without a point" },
];
const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
function pickN<T>(arr: T[], n: number): T[] {
  const c = [...arr]; const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}

/** A randomized USA-vs-Senegal sample so admins can preview the fan feed. */
function sampleTweetContext(): TweetContext {
  const homeScore = rint(1, 3);
  const awayScore = rint(0, 2);
  const lateMin = rint(85, 92);
  const [lost, gained, riser] = pickN(TEAMS, 3);
  const perfectPickers = pickN(TEAMS.filter((t) => t !== lost), rint(1, 2));
  const scorers = [
    { player: "Christian Pulisic", minute: rint(15, 40), country: "USA" },
    { player: "Nicolas Jackson", minute: rint(20, 70), country: "Senegal" },
    { player: "Folarin Balogun", minute: lateMin, country: "USA" },
  ].slice(0, Math.max(1, homeScore + awayScore));
  return {
    homeCountry: "USA",
    awayCountry: "Senegal",
    homeScore,
    awayScore,
    matchHashtag: "#USAvsSenegal",
    scorers,
    perfectPickers,
    outcomePickers: pickN(TEAMS.filter((t) => !perfectPickers.includes(t)), 1),
    lostPerfect: [lost],
    gainedPerfect: [gained],
    lateScorer: "Folarin Balogun",
    varInvolved: Math.random() < 0.5,
    groupRisers: [{ team: riser, group: "A" }],
    involvedTeams: TEAMS,
    managers: SAMPLE_MANAGERS,
    strugglers: SAMPLE_STRUGGLERS,
  };
}

function samplePreMatchContext(): PreMatchTweetContext {
  const groups = ["A", "B", "C", "D"];
  const picks: PreMatchPick[] = pickN(TEAMS, 3).map((team, i) => ({
    team, predHome: rint(0, 3), predAway: rint(0, 3), group: groups[i % groups.length],
  }));
  const groupmates: Record<string, string[]> = {};
  for (const p of picks) groupmates[p.team] = TEAMS.filter((t) => t !== p.team).slice(0, 2);
  return {
    homeCountry: "USA", awayCountry: "Senegal", matchHashtag: "#USAvsSenegal",
    minutesToKickoff: 30, picks, groupmates,
    managers: SAMPLE_MANAGERS, strugglers: SAMPLE_STRUGGLERS,
  };
}

function sampleHalftimeContext(): HalftimeTweetContext {
  const [a, b, c] = pickN(TEAMS, 3);
  return {
    homeCountry: "USA", awayCountry: "Senegal", matchHashtag: "#USAvsSenegal",
    homeScore: rint(0, 2), awayScore: rint(0, 2),
    onTrackPerfect: [a], onTrackOutcome: [b], wrongFooted: [c],
    managers: SAMPLE_MANAGERS, strugglers: SAMPLE_STRUGGLERS,
  };
}

/** POST /api/admin/social — admin-only sample fan-tweet generator (not persisted).
 *  Body { phase?: "result" | "prematch" | "halftime" } (default "result"). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { phase?: "result" | "prematch" | "halftime" };
  const phase = body.phase ?? "result";

  const base =
    phase === "prematch" ? await generatePreMatchTweets(samplePreMatchContext())
    : phase === "halftime" ? await generateHalftimeTweets(sampleHalftimeContext())
    : await generateTweets(sampleTweetContext());

  const now = new Date().toISOString();
  const tweets = base.map((t, i) => ({ id: `sample_${i}`, fixtureId: 0, createdAt: now, ...t }));
  return NextResponse.json({ ok: true, tweets, hasKey: !!process.env.GEMINI_API_KEY });
}
