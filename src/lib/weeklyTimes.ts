import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getStandings } from "./apiFootball";
import { toGroupStandings } from "./wcMap";
import { PUNDIT_PROFILES } from "./commentary";
import type {
  WeeklyTimes, WeeklyGroup, WeeklyStatLine, FeedEntry, PunditLine, PunditSpeaker,
} from "./feedTypes";
import type { UserProfile, ScoreDoc } from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SPEAKERS: PunditSpeaker[] = ["dempsey", "howard", "donovan"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ordinalPlace(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]) + " place";
}

/** Snapshot of group ranks stored each run so we can show week-over-week movement. */
export interface WeeklySnapshot {
  createdAt: string;
  ranks: Record<string, Record<string, number>>; // group -> teamName -> rank
}

export interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  groups: WeeklyGroup[];
  topPoints: WeeklyStatLine[];
  topPerfects: WeeklyStatLine[];
  closeRaces: string[];
  movers: string[];
  matchesPlayed: number;
}

/** Gather everything the newspaper needs. Reads the previous snapshot but does
 *  NOT write one (the caller decides whether to persist). */
export async function gatherWeeklyData(db: Firestore): Promise<WeeklyData> {
  const now = new Date();
  const weekEnd = isoDate(now);
  const weekStartDate = new Date(now.getTime() - WEEK_MS);
  const weekStart = isoDate(weekStartDate);

  // --- WC group standings + week-over-week movement ---
  const standings = toGroupStandings(await getStandings().catch(() => []));
  const snapSnap = await db.collection("weeklySnapshots").orderBy("createdAt", "desc").limit(1).get();
  const prev = snapSnap.docs[0]?.data() as WeeklySnapshot | undefined;

  const groups: WeeklyGroup[] = standings.map((g) => ({
    group: g.group,
    teams: g.rows.map((r) => ({
      team: r.teamName,
      logo: r.logo,
      rank: r.rank,
      prevRank: prev?.ranks?.[g.group]?.[r.teamName] ?? null,
      points: r.points,
      played: r.played,
    })),
  }));

  const movers: string[] = [];
  for (const g of groups) {
    for (const t of g.teams) {
      if (t.prevRank == null || t.prevRank === t.rank) continue;
      if (t.rank < t.prevRank) movers.push(`${t.team} climbed from ${t.prevRank}${ordSuffix(t.prevRank)} to ${t.rank}${ordSuffix(t.rank)} in ${g.group}`);
      else movers.push(`${t.team} slipped from ${t.prevRank}${ordSuffix(t.prevRank)} to ${t.rank}${ordSuffix(t.rank)} in ${g.group}`);
    }
  }

  // --- Weekly points + perfect games per player, from feed entries in the window ---
  const feedSnap = await db
    .collection("feedEntries")
    .where("kickoff", ">=", weekStartDate.toISOString())
    .get();

  const ptsByTeam = new Map<string, { pts: number; logo?: string }>();
  const perfByTeam = new Map<string, { n: number; logo?: string }>();
  let matchesPlayed = 0;
  feedSnap.forEach((d) => {
    const e = d.data() as FeedEntry;
    matchesPlayed++;
    for (const u of e.perUser) {
      const p = ptsByTeam.get(u.teamName) ?? { pts: 0, logo: u.logoUrl };
      p.pts += u.pts; p.logo = u.logoUrl ?? p.logo; ptsByTeam.set(u.teamName, p);
      if (u.perfect) {
        const q = perfByTeam.get(u.teamName) ?? { n: 0, logo: u.logoUrl };
        q.n++; q.logo = u.logoUrl ?? q.logo; perfByTeam.set(u.teamName, q);
      }
    }
  });
  const topPoints: WeeklyStatLine[] = [...ptsByTeam.entries()]
    .filter(([, v]) => v.pts > 0)
    .map(([teamName, v]) => ({ teamName, logoUrl: v.logo, value: v.pts }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const topPerfects: WeeklyStatLine[] = [...perfByTeam.entries()]
    .map(([teamName, v]) => ({ teamName, logoUrl: v.logo, value: v.n }))
    .sort((a, b) => b.value - a.value).slice(0, 5);

  // --- Close races: friends leaderboard + tight WC qualifying spots ---
  const [usersSnap, scoresSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("scores").get(),
  ]);
  const teamByUid = new Map<string, string>();
  usersSnap.forEach((d) => { const u = d.data() as UserProfile; teamByUid.set(u.uid, u.teamName); });
  const totals = scoresSnap.docs
    .map((d) => { const s = d.data() as ScoreDoc; return { team: teamByUid.get(s.uid) ?? "?", total: s.total ?? 0 }; })
    .filter((x) => x.team !== "?")
    .sort((a, b) => b.total - a.total);

  const closeRaces: string[] = [];
  for (let i = 0; i < totals.length - 1 && i < 6; i++) {
    const gap = totals[i].total - totals[i + 1].total;
    if (gap <= 2) closeRaces.push(`${totals[i].team} leads ${totals[i + 1].team} by just ${gap} pt${gap === 1 ? "" : "s"} for ${ordinalPlace(i + 1)}.`);
  }
  for (const g of groups) {
    const sorted = [...g.teams].sort((a, b) => a.rank - b.rank);
    if (sorted.length >= 3) {
      const gap = sorted[1].points - sorted[2].points;
      if (gap <= 1) closeRaces.push(`${g.group}: ${sorted[2].team} sit ${gap} point${gap === 1 ? "" : "s"} behind ${sorted[1].team} for the final qualifying place.`);
    }
  }

  return { weekStart, weekEnd, groups, topPoints, topPerfects, closeRaces, movers, matchesPlayed };
}

function ordSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}

/** Build the snapshot of current ranks (for next week's movement). */
export function snapshotFromGroups(groups: WeeklyGroup[]): WeeklySnapshot {
  const ranks: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    ranks[g.group] = {};
    for (const t of g.teams) ranks[g.group][t.team] = t.rank;
  }
  return { createdAt: new Date().toISOString(), ranks };
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
  f.push(`Matches scored this week: ${d.matchesPlayed}.`);
  if (d.topPoints.length) f.push("Most league points this week: " + d.topPoints.map((p) => `${p.teamName} (${p.value})`).join(", ") + ".");
  if (d.topPerfects.length && d.topPerfects[0].value > 0) f.push("Most perfect (exact-score) picks this week: " + d.topPerfects.filter((p) => p.value > 0).map((p) => `${p.teamName} (${p.value})`).join(", ") + ".");
  if (d.movers.length) f.push("Group movement: " + d.movers.slice(0, 12).join("; ") + ".");
  if (d.closeRaces.length) f.push("Tight races: " + d.closeRaces.join(" "));
  if (!d.movers.length && d.groups.length) f.push("Opening week — no prior standings to compare yet.");
  return f.join("\n");
}

async function generateNewspaperText(d: WeeklyData): Promise<NewspaperText> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackNewspaper(d);

  const prompt = `${PUNDIT_PROFILES}

You are writing this week's edition of "The Global Football Cup Times", a tongue-in-cheek newspaper for a 16-person friends' World Cup 2026 prediction league. Players earn points by predicting match scores; an exact score is a "perfect game".

FACTS (use ONLY these — never invent players, scores, stats, or standings not listed):
${factSheet(d)}

Produce:
- headline: a punchy newspaper front-page headline about the week.
- subhead: one-sentence deck under the headline.
- body: 2 to 4 short newspaper paragraphs covering who racked up points, perfect games, notable group movement, and the closest races. Lively sports-desk prose. No markdown.
- punditColumn: a 4-6 line back-and-forth between the three pundits reacting to the week — bantering, ribbing each other, occasionally name-dropping their own World Cup moments. Each line under ~240 chars.
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
            temperature: 0.95,
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
    ? `${leader.teamName} Lead the Week with ${leader.value} Points`
    : "A Quiet Week Across the League";
  const body: string[] = [];
  if (leader) {
    body.push(`${leader.teamName} topped the weekly charts with ${leader.value} points from ${d.matchesPlayed} scored match${d.matchesPlayed === 1 ? "" : "es"}${d.topPoints[1] ? `, ahead of ${d.topPoints[1].teamName} on ${d.topPoints[1].value}` : ""}.`);
  } else {
    body.push(`No points changed hands this week across ${d.matchesPlayed} scored match${d.matchesPlayed === 1 ? "" : "es"}.`);
  }
  const perf = d.topPerfects.find((p) => p.value > 0);
  if (perf) body.push(`${perf.teamName} led the perfect-game count with ${perf.value} exact scoreline${perf.value === 1 ? "" : "s"} called on the nose.`);
  if (d.movers.length) body.push("On the pitch, " + d.movers.slice(0, 4).join(", ") + ".");
  if (d.closeRaces.length) body.push("Watch this space: " + d.closeRaces.slice(0, 2).join(" "));
  return {
    headline,
    subhead: `Week ending ${d.weekEnd} · ${d.matchesPlayed} matches in the books`,
    body,
    punditColumn: [
      { speaker: "donovan", text: leader ? `${leader.teamName} set the pace this week — composed, clinical, exactly how you want to build a lead.` : "Quiet week, fellas — calm before the storm." },
      { speaker: "dempsey", text: "Composed? I scored in three World Cups, Landon, I know clinical when I see it. This was just taking your chances." },
      { speaker: "howard", text: "Says the striker. Try making 15 saves in a World Cup game, Clint, then we'll talk about hard work." },
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
    topPoints: d.topPoints,
    topPerfects: d.topPerfects,
    closeRaces: d.closeRaces,
    matchesPlayed: d.matchesPlayed,
    createdAt: new Date().toISOString(),
  };
}
