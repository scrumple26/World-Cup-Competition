import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { generateTweets, type TweetContext } from "@/lib/social";

export const dynamic = "force-dynamic";

const TEAMS = ["Galaxy Strikers", "Penalty Box Pros", "Last Minute Heroes", "VAR Wars", "Golden Boot Crew", "Midfield Maestros"];
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
  };
}

/** POST /api/admin/social — admin-only sample fan-tweet generator (not persisted). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const base = await generateTweets(sampleTweetContext());
  const now = new Date().toISOString();
  const tweets = base.map((t, i) => ({ id: `sample_${i}`, fixtureId: 0, createdAt: now, ...t }));
  return NextResponse.json({ ok: true, tweets, hasKey: !!process.env.GEMINI_API_KEY });
}
