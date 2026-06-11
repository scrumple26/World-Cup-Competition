import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { FRIEND_GROUPS, isGroupRound } from "./wc";
import { getStandings } from "./apiFootball";
import { toGroupStandings } from "./wcMap";
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
  /** Teams on a current run of consecutive perfect (exact-score) picks. */
  perfectStreaks: string[];
  /** Teams on a current run of consecutive scored matches without a point. */
  coldStreaks: string[];
  // World Cup watch (pundit context only — not displayed as tables)
  wcGroupLeaders: string[];
  wcClimbers: string[];
  wcKnockoutWinners: string[];
  speculationCue: string | null;
  /** Current WC group ranks, persisted as a snapshot to compute next week's climbers. */
  wcRanks: Record<string, Record<string, number>>;
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
      homeScore: e.homeScore, awayScore: e.awayScore,
      round: e.round, date: e.kickoff,
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

  // --- Streaks: walk EVERY scored match chronologically, per team ---
  const seqByTeam = new Map<string, { perfect: boolean; pts: number }[]>();
  const allFeedSnap = await db.collection("feedEntries").orderBy("kickoff").get().catch(() => null);
  if (allFeedSnap) {
    allFeedSnap.forEach((d) => {
      const e = d.data() as FeedEntry;
      for (const u of e.perUser) {
        const arr = seqByTeam.get(u.teamName) ?? [];
        arr.push({ perfect: u.perfect, pts: u.pts });
        seqByTeam.set(u.teamName, arr);
      }
    });
  }
  const perfectRuns: { team: string; n: number }[] = [];
  const coldRuns: { team: string; n: number }[] = [];
  for (const [team, seq] of seqByTeam) {
    let p = 0;
    for (let i = seq.length - 1; i >= 0 && seq[i].perfect; i--) p++;
    if (p >= 2) perfectRuns.push({ team, n: p });
    let c = 0;
    for (let i = seq.length - 1; i >= 0 && seq[i].pts === 0; i--) c++;
    if (c >= 3) coldRuns.push({ team, n: c });
  }
  const perfectStreaks = perfectRuns
    .sort((a, b) => b.n - a.n)
    .map((r) => `${r.team} has nailed the exact score ${r.n} matches running`);
  const coldStreaks = coldRuns
    .sort((a, b) => b.n - a.n)
    .map((r) => `${r.team} has gone ${r.n} straight matches without a point`);

  // --- Close races: only the battles to finish 1st or 2nd (the qualifying spots) in each group ---
  const closeRaces: string[] = [];
  for (const g of groups) {
    const t = g.teams;
    if (t.length >= 2) {
      const gap12 = t[0].points - t[1].points;
      if (gap12 === 0) closeRaces.push(`${g.group}: ${t[0].team} and ${t[1].team} are tied at the top on ${t[0].points} pts.`);
      else if (gap12 <= 2) closeRaces.push(`${g.group}: ${t[1].team} is ${gap12} pt${gap12 === 1 ? "" : "s"} behind ${t[0].team} for top spot.`);
    }
    if (t.length >= 3) {
      const gap23 = t[1].points - t[2].points;
      if (gap23 === 0) closeRaces.push(`${g.group}: ${t[1].team} and ${t[2].team} are level on ${t[1].points} pts for the 2nd qualifying spot.`);
      else if (gap23 <= 2) closeRaces.push(`${g.group}: ${t[2].team} is ${gap23} pt${gap23 === 1 ? "" : "s"} behind ${t[1].team} for the 2nd qualifying spot.`);
    }
  }

  // --- World Cup watch: standings context for pundit speculation ---
  const wcGroupLeaders: string[] = [];
  const wcClimbers: string[] = [];
  const wcKnockoutWinners: string[] = [];
  let speculationCue: string | null = null;
  const wcRanks: Record<string, Record<string, number>> = {};

  const wcStandings = toGroupStandings(await getStandings().catch(() => []));
  if (wcStandings.length) {
    const snap = await db.collection("wcSnapshots").orderBy("createdAt", "desc").limit(1).get().catch(() => null);
    const prev = snap && !snap.empty ? (snap.docs[0].data() as { ranks?: Record<string, Record<string, number>> }).ranks : undefined;

    for (const g of wcStandings) {
      wcRanks[g.group] = {};
      g.rows.forEach((r) => { wcRanks[g.group][r.teamName] = r.rank; });
      if (g.rows[0]) {
        wcGroupLeaders.push(`${g.group}: ${g.rows[0].teamName} top${g.rows[1] ? `, ${g.rows[1].teamName} 2nd` : ""}`);
      }
      for (const r of g.rows) {
        const prevRank = prev?.[g.group]?.[r.teamName];
        if (prevRank != null && r.rank < prevRank) wcClimbers.push(`${r.teamName} climbed to ${r.rank}${ordSuffix(r.rank)} in ${g.group}`);
      }
    }

    // Random speculation cue (~65% of editions) on a real group or knockout race.
    if (Math.random() < 0.65) {
      const withTwo = wcStandings.filter((g) => g.rows.length >= 2);
      if (withTwo.length) {
        const g = withTwo[Math.floor(Math.random() * withTwo.length)];
        speculationCue = `You MAY speculate (opinion, clearly as a prediction) on whether ${g.rows[0].teamName} or ${g.rows[1].teamName} can win ${g.group} or advance to the knockout round.`;
      }
    }
  }

  // Knockout winners from this week's results.
  for (const r of wcResults) {
    if (r.round && !isGroupRound(r.round) && r.homeScore !== r.awayScore) {
      const winner = r.homeScore > r.awayScore ? r.homeTeam : r.awayTeam;
      wcKnockoutWinners.push(`${winner} won their ${r.round} match`);
    }
  }

  return {
    weekStart, weekEnd, groups, wcResults, topPoints, topPerfects, closeRaces, movers, matchesPlayed,
    perfectStreaks, coldStreaks,
    wcGroupLeaders, wcClimbers, wcKnockoutWinners, speculationCue, wcRanks,
  };
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
  f.push("This is the Global Football Cup — a 16-player World Cup 2026 prediction competition in 4 groups (A–D). Always call it the Global Football Cup (never a 'friends league' or 'prediction league'). Focus the paper on these players, with a light, witty tone.");
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
  if (d.perfectStreaks.length) f.push("HOT STREAKS (perfect-pick runs): " + d.perfectStreaks.slice(0, 5).join("; ") + ".");
  if (d.coldStreaks.length) f.push("COLD STREAKS (pointless runs): " + d.coldStreaks.slice(0, 5).join("; ") + ".");
  if (d.closeRaces.length) f.push("Tight races: " + d.closeRaces.join(" "));
  if (d.wcResults.length) f.push("Real World Cup results this week (backdrop): " + d.wcResults.map((r) => `${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`).join(", ") + ".");
  if (d.wcKnockoutWinners.length) f.push("Knockout winners: " + d.wcKnockoutWinners.join("; ") + ".");
  if (d.wcClimbers.length) f.push("WC teams that climbed their group: " + d.wcClimbers.slice(0, 10).join("; ") + ".");
  if (d.wcGroupLeaders.length) f.push("Current WC group leaders: " + d.wcGroupLeaders.slice(0, 12).join("; ") + ".");
  if (d.speculationCue) f.push("SPECULATION: " + d.speculationCue);
  if (!d.matchesPlayed) f.push("No matches were scored this week — keep it light and look ahead.");
  return f.join("\n");
}

async function generateNewspaperText(d: WeeklyData): Promise<NewspaperText> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackNewspaper(d);

  const prompt = `${PUNDIT_PROFILES}

You are writing this week's edition of "Pundit Football Times" — a witty newspaper for the Global Football Cup, a 16-player World Cup 2026 prediction competition (4 groups, A–D). Players score points by predicting match results; an exact score is a "perfect game". The paper is MOSTLY about the Global Football Cup race; real World Cup results are just the backdrop. Keep a light, humorous tone throughout — never call it a "friends league".

FACTS (use ONLY these — never invent players, scores, standings, or events not listed):
${factSheet(d)}

Produce:
- headline: a punchy, tabloid back-page splash about the Global Football Cup this week. Lean HARD into wordplay — a pun or play on a GFC team name, a player's name, or a football cliché. Make it grabby and a little cheeky (think tabloid sports desk), and keep it about the GFC race, not the real World Cup. Avoid generic "Team X leads the way"-style headlines.
- subhead: a one-sentence deck that lands the joke or sharpens the angle.
- body: 2-4 short, witty newspaper paragraphs about the Global Football Cup race — who surged, perfect games, hot and cold streaks, group movement, tightest battles. Reference the real WC results only as context. No markdown.
- punditColumn: a tight, conversational exchange of EXACTLY 6 lines among the three pundits (no more). Make it a real desk chat: one pundit asks a question and another answers, they build on each other, agree and disagree.
  * Lead with SUBSTANCE — analyze the Global Football Cup race, and also work in the real World Cup: call out teams that climbed their group or won their knockout match, and if a SPECULATION fact is provided, have them give their take on whether that team can win its group / advance.
  * Banter a bit, but it's NOT all banter — keep ribbing and the occasional World Cup recollection as seasoning (roughly 1 in 4 lines), not the whole conversation.
  * Each line under ~240 chars.
Do not fabricate anything beyond the FACTS (you MAY give clearly-framed opinions/predictions only when a SPECULATION fact invites it).`;

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
      punditColumn: (punditColumn.length ? punditColumn : fallbackNewspaper(d).punditColumn).slice(0, 6),
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
