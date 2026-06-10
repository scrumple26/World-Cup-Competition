import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { FRIEND_GROUPS } from "./wc";
import { PUNDIT_PROFILES } from "./commentary";
import type {
  WeeklyTimes, WeeklyGroup, WeeklyGroupTeam, WeeklyStatLine, WcResult,
  FeedEntry, PunditLine, PunditSpeaker,
} from "./feedTypes";
import type { UserProfile, ScoreDoc } from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SPEAKERS: PunditSpeaker[] = ["dempsey", "howard", "donovan"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ordSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
function ordinalPlace(n: number): string {
  return `${n}${ordSuffix(n)} place`;
}
/** Cumulative total as of a given date from a score history. */
function totalAsOf(history: { date: string; total: number }[], dateStr: string): number {
  const on = [...history].sort((a, b) => a.date.localeCompare(b.date)).filter((h) => h.date <= dateStr);
  return on.length ? on[on.length - 1].total : 0;
}

export interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  groups: WeeklyGroup[];
  wcResults: WcResult[];
  topPoints: WeeklyStatLine[];
  topPerfects: WeeklyStatLine[];
  closeRaces: string[];
  movers: string[];
  matchesPlayed: number;
}

/** Gather everything the newspaper needs — centered on the friends' league. */
export async function gatherWeeklyData(db: Firestore): Promise<WeeklyData> {
  const now = new Date();
  const weekEnd = isoDate(now);
  const weekStartDate = new Date(now.getTime() - WEEK_MS);
  const weekStart = isoDate(weekStartDate);

  const [usersSnap, scoresSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("scores").get(),
  ]);
  const users = usersSnap.docs.map((d) => d.data() as UserProfile).filter((u) => !u.isBot || true);
  const scoreByUid = new Map<string, ScoreDoc>();
  scoresSnap.forEach((d) => { const s = d.data() as ScoreDoc; scoreByUid.set(s.uid, s); });

  // --- Friendly competition group standings, with week-over-week movement ---
  const groups: WeeklyGroup[] = [];
  const movers: string[] = [];
  for (const letter of FRIEND_GROUPS) {
    const members = users.filter((u) => u.friendGroup === letter);
    if (members.length === 0) continue;
    const withScore = members.map((u) => {
      const s = scoreByUid.get(u.uid);
      const total = s?.total ?? 0;
      const prevTotal = totalAsOf(s?.history ?? [], weekStart);
      return { u, total, prevTotal };
    });
    const curRanked = [...withScore].sort((a, b) => b.total - a.total);
    const prevRanked = [...withScore].sort((a, b) => b.prevTotal - a.prevTotal);
    const prevRankByUid = new Map<string, number>();
    prevRanked.forEach((x, i) => prevRankByUid.set(x.u.uid, i + 1));

    const teams: WeeklyGroupTeam[] = curRanked.map((x, i) => {
      const rank = i + 1;
      const prevRank = prevRankByUid.get(x.u.uid) ?? null;
      if (prevRank != null && prevRank !== rank) {
        if (rank < prevRank) movers.push(`${x.u.teamName} climbed to ${rank}${ordSuffix(rank)} in Group ${letter}`);
        else movers.push(`${x.u.teamName} slipped to ${rank}${ordSuffix(rank)} in Group ${letter}`);
      }
      return { team: x.u.teamName, logo: x.u.logoUrl, rank, prevRank, points: x.total, weekPts: x.total - x.prevTotal };
    });
    groups.push({ group: `Group ${letter}`, teams });
  }

  // --- This week's matches: WC results + weekly points + perfect games ---
  const feedSnap = await db
    .collection("feedEntries")
    .where("kickoff", ">=", weekStartDate.toISOString())
    .get();

  const ptsByTeam = new Map<string, { pts: number; logo?: string }>();
  const perfByTeam = new Map<string, { n: number; logo?: string }>();
  const wcResults: WcResult[] = [];
  feedSnap.forEach((d) => {
    const e = d.data() as FeedEntry;
    wcResults.push({
      homeTeam: e.homeTeam, awayTeam: e.awayTeam,
      homeLogo: e.homeLogo, awayLogo: e.awayLogo,
      homeScore: e.homeScore, awayScore: e.awayScore, date: e.kickoff,
    });
    for (const u of e.perUser) {
      const p = ptsByTeam.get(u.teamName) ?? { pts: 0, logo: u.logoUrl };
      p.pts += u.pts; p.logo = u.logoUrl ?? p.logo; ptsByTeam.set(u.teamName, p);
      if (u.perfect) {
        const q = perfByTeam.get(u.teamName) ?? { n: 0, logo: u.logoUrl };
        q.n++; q.logo = u.logoUrl ?? q.logo; perfByTeam.set(u.teamName, q);
      }
    }
  });
  wcResults.sort((a, b) => a.date.localeCompare(b.date));
  const matchesPlayed = wcResults.length;

  const topPoints: WeeklyStatLine[] = [...ptsByTeam.entries()]
    .filter(([, v]) => v.pts > 0)
    .map(([teamName, v]) => ({ teamName, logoUrl: v.logo, value: v.pts }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const topPerfects: WeeklyStatLine[] = [...perfByTeam.entries()]
    .map(([teamName, v]) => ({ teamName, logoUrl: v.logo, value: v.n }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  // --- Close races in the friends' league (overall + within each group's qualifying line) ---
  const closeRaces: string[] = [];
  const overall = users
    .map((u) => ({ team: u.teamName, total: scoreByUid.get(u.uid)?.total ?? 0 }))
    .sort((a, b) => b.total - a.total);
  for (let i = 0; i < overall.length - 1 && i < 4; i++) {
    const gap = overall[i].total - overall[i + 1].total;
    if (gap === 0) closeRaces.push(`${overall[i].team} and ${overall[i + 1].team} are tied on ${overall[i].total} pts for ${ordinalPlace(i + 1)} overall.`);
    else if (gap <= 2) closeRaces.push(`${overall[i].team} leads ${overall[i + 1].team} by ${gap} pt${gap === 1 ? "" : "s"} for ${ordinalPlace(i + 1)} overall.`);
  }
  for (const g of groups) {
    if (g.teams.length >= 3) {
      const gap = g.teams[1].points - g.teams[2].points;
      if (gap === 0) closeRaces.push(`${g.group}: ${g.teams[1].team} and ${g.teams[2].team} are level on ${g.teams[1].points} pts for 2nd.`);
      else if (gap <= 2) closeRaces.push(`${g.group}: ${g.teams[2].team} is ${gap} pt${gap === 1 ? "" : "s"} behind ${g.teams[1].team} for 2nd.`);
    }
  }

  return { weekStart, weekEnd, groups, wcResults, topPoints, topPerfects, closeRaces, movers, matchesPlayed };
}

// ── AI newspaper text ─────────────────────────────────────────────────────────

interface NewspaperText {
  headline: string;
  subhead: string;
  body: string[];
  punditColumn: PunditLine[];
}

function factSheet(d: WeeklyData): string {
  const f: string[] = [];
  f.push("This is the friends' prediction league (16 players in 4 groups, A–D). Focus the paper on THEM.");
  f.push("IMPORTANT: points equal = a TIE. A 0-point gap is NOT a lead — never say a team 'leads by 0'; say they are tied/level.");
  const leaders = d.groups.map((g) => {
    if (!g.teams[0]) return "";
    const tiedTop = g.teams[1] && g.teams[1].points === g.teams[0].points;
    return tiedTop
      ? `${g.group}: ${g.teams[0].team} and ${g.teams[1].team} tied at the top on ${g.teams[0].points} pts`
      : `${g.group}: ${g.teams[0].team} lead on ${g.teams[0].points} pts`;
  }).filter(Boolean);
  if (leaders.length) f.push("Group leaders — " + leaders.join("; ") + ".");
  if (d.topPoints.length) f.push("Most points this week: " + d.topPoints.map((p) => `${p.teamName} (${p.value})`).join(", ") + ".");
  const perf = d.topPerfects.filter((p) => p.value > 0);
  if (perf.length) f.push("Most perfect (exact-score) picks: " + perf.map((p) => `${p.teamName} (${p.value})`).join(", ") + ".");
  if (d.movers.length) f.push("Standings movement: " + d.movers.slice(0, 10).join("; ") + ".");
  if (d.closeRaces.length) f.push("Tight races: " + d.closeRaces.join(" "));
  if (d.wcResults.length) f.push("Real World Cup results this week (backdrop): " + d.wcResults.map((r) => `${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`).join(", ") + ".");
  if (!d.matchesPlayed) f.push("No matches were scored this week — keep it light and look ahead.");
  return f.join("\n");
}

async function generateNewspaperText(d: WeeklyData): Promise<NewspaperText> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackNewspaper(d);

  const prompt = `${PUNDIT_PROFILES}

You are writing this week's edition of "The Global Football Cup Times" — a tongue-in-cheek newspaper for a 16-person friends' World Cup 2026 prediction league. Players score points by predicting match results; an exact score is a "perfect game". The paper is MOSTLY about the friends' competition; real World Cup results are just the backdrop.

FACTS (use ONLY these — never invent players, scores, standings, or events not listed):
${factSheet(d)}

Produce:
- headline: a punchy front-page headline about the friends' league this week.
- subhead: a one-sentence deck.
- body: 2-4 short newspaper paragraphs about the friends' race — who surged, perfect games, group movement, tightest battles. Reference the real WC results only as context. No markdown.
- punditColumn: a LONGER, genuinely conversational exchange of 8-12 lines among the three pundits about the friends' league. Make it feel like a real desk chat: one pundit asks a question and another answers, they interrupt, agree, and DISAGREE. They should rib and tease each other, and occasionally (not constantly) recollect their own World Cup playing days. Each line under ~240 chars.
Do not fabricate anything beyond the FACTS.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.97,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                headline: { type: "STRING" },
                subhead: { type: "STRING" },
                body: { type: "ARRAY", items: { type: "STRING" } },
                punditColumn: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { speaker: { type: "STRING", enum: SPEAKERS }, text: { type: "STRING" } },
                    required: ["speaker", "text"],
                  },
                },
              },
              required: ["headline", "subhead", "body", "punditColumn"],
            },
          },
        }),
      },
    );
    if (!res.ok) return fallbackNewspaper(d);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return fallbackNewspaper(d);
    const parsed = JSON.parse(raw) as Partial<NewspaperText>;
    const body = Array.isArray(parsed.body) ? parsed.body.filter((x) => typeof x === "string" && x.trim()) : [];
    const punditColumn = Array.isArray(parsed.punditColumn)
      ? parsed.punditColumn.filter((l): l is PunditLine =>
          !!l && SPEAKERS.includes((l as PunditLine).speaker) && typeof (l as PunditLine).text === "string")
      : [];
    if (!parsed.headline || body.length === 0) return fallbackNewspaper(d);
    return {
      headline: parsed.headline,
      subhead: parsed.subhead ?? "",
      body,
      punditColumn: punditColumn.length ? punditColumn : fallbackNewspaper(d).punditColumn,
    };
  } catch {
    return fallbackNewspaper(d);
  }
}

function fallbackNewspaper(d: WeeklyData): NewspaperText {
  const leader = d.topPoints[0];
  const headline = leader
    ? `${leader.teamName} Surge with ${leader.value} Points This Week`
    : "A Quiet Week in the League";
  const body: string[] = [];
  if (leader) body.push(`${leader.teamName} topped the weekly charts with ${leader.value} points${d.topPoints[1] ? `, ahead of ${d.topPoints[1].teamName} on ${d.topPoints[1].value}` : ""}.`);
  else body.push(`No points changed hands this week across ${d.matchesPlayed} scored match${d.matchesPlayed === 1 ? "" : "es"}.`);
  const perf = d.topPerfects.find((p) => p.value > 0);
  if (perf) body.push(`${perf.teamName} led the perfect-game count with ${perf.value} exact scoreline${perf.value === 1 ? "" : "s"}.`);
  if (d.movers.length) body.push("In the groups, " + d.movers.slice(0, 4).join(", ") + ".");
  if (d.closeRaces.length) body.push("Watch this space: " + d.closeRaces.slice(0, 2).join(" "));
  return {
    headline,
    subhead: `Week ending ${d.weekEnd} · ${d.matchesPlayed} World Cup matches in the books`,
    body,
    punditColumn: [
      { speaker: "donovan", text: leader ? `So who impressed you most this week, fellas? For me it's ${leader.teamName} — clinical with the picks.` : "Quiet week, fellas. What are we even talking about?" },
      { speaker: "dempsey", text: "Clinical? I scored in three World Cups, Landon — I know clinical. That's just taking your chances when they come." },
      { speaker: "howard", text: "Here we go again with the three World Cups. Clint, did you ever make 15 saves in a game? No? Then sit down." },
      { speaker: "donovan", text: "Boys, boys. Point is the group races are tightening. Somebody's getting caught if they sleep on it." },
      { speaker: "dempsey", text: "Tim just wants the goalkeepers union to get a column. Relax." },
      { speaker: "howard", text: "I'll relax when these guys stop predicting 4-4 every match. Defend a little, people!" },
    ],
  };
}

/** Build the full WeeklyTimes object (with AI text) from gathered data. */
export async function buildWeeklyTimes(d: WeeklyData): Promise<WeeklyTimes> {
  const text = await generateNewspaperText(d);
  return {
    id: d.weekEnd,
    weekStart: d.weekStart,
    weekEnd: d.weekEnd,
    headline: text.headline,
    subhead: text.subhead,
    body: text.body,
    punditColumn: text.punditColumn,
    groups: d.groups,
    wcResults: d.wcResults,
    topPoints: d.topPoints,
    topPerfects: d.topPerfects,
    closeRaces: d.closeRaces,
    matchesPlayed: d.matchesPlayed,
    createdAt: new Date().toISOString(),
  };
}
