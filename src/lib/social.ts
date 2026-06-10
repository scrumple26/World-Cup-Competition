import "server-only";

import type { FauxTweet } from "./feedTypes";

/**
 * AI faux fan-tweets. Each tweet is written by a fan of a Global Football Cup
 * (GFC) team and ties a REAL match moment (goal/result) to a GFC prediction
 * angle. Every claim must come from the provided facts; hashtags are enforced.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export interface TweetContext {
  homeCountry: string;
  awayCountry: string;
  homeScore: number;
  awayScore: number;
  matchHashtag: string; // "#NorwayvsSenegal"
  scorers: { player: string; minute: number; country: string }[];
  perfectPickers: string[];   // GFC teams that nailed the exact score
  outcomePickers: string[];   // GFC teams that got the result right
  lostPerfect: string[];      // GFC teams whose perfect pick was broken late
  gainedPerfect: string[];    // GFC teams handed a perfect pick late
  lateScorer: string | null;  // the late scorer involved in the swing
  varInvolved: boolean;
  groupRisers: { team: string; group: string }[]; // GFC teams now 1st in their group
  involvedTeams: string[];    // GFC teams worth tweeting about
}

const REQUIRED_TAG = "#GlobalFootballWorldCup";

function slugHandle(team: string): string {
  const base = team.replace(/[^a-zA-Z0-9]/g, "");
  return `@${base || "GFC"}Fan`;
}

function factSheet(c: TweetContext): string {
  const f: string[] = [];
  f.push(`Real World Cup match: ${c.homeCountry} ${c.homeScore}-${c.awayScore} ${c.awayCountry}.`);
  if (c.scorers.length) f.push("Goals: " + c.scorers.map((s) => `${s.player} (${s.country}) ${s.minute}'`).join(", ") + ".");
  if (c.perfectPickers.length) f.push("GFC teams who nailed the EXACT score: " + c.perfectPickers.join(", ") + ".");
  if (c.outcomePickers.length) f.push("GFC teams who got the result right: " + c.outcomePickers.join(", ") + ".");
  if (c.lostPerfect.length) f.push(`A late goal${c.lateScorer ? ` by ${c.lateScorer}` : ""}${c.varInvolved ? " (after VAR)" : ""} BROKE the perfect pick of: ${c.lostPerfect.join(", ")}.`);
  if (c.gainedPerfect.length) f.push(`A late goal${c.lateScorer ? ` by ${c.lateScorer}` : ""}${c.varInvolved ? " (after VAR)" : ""} HANDED a perfect pick to: ${c.gainedPerfect.join(", ")}.`);
  if (c.groupRisers.length) f.push("After this result, these GFC teams rose to 1st in their group: " + c.groupRisers.map((r) => `${r.team} (Group ${r.group})`).join(", ") + ".");
  return f.join("\n");
}

interface RawTweet { fanOf: string; handle?: string; displayName?: string; text: string; }

function enforceHashtags(text: string, matchHashtag: string): string {
  let out = text.trim();
  if (matchHashtag && !out.toLowerCase().includes(matchHashtag.toLowerCase())) out += ` ${matchHashtag}`;
  if (!out.toLowerCase().includes(REQUIRED_TAG.toLowerCase())) out += ` ${REQUIRED_TAG}`;
  return out;
}

export async function generateTweets(c: TweetContext): Promise<Omit<FauxTweet, "id" | "fixtureId" | "createdAt">[]> {
  const matchup = `${c.homeCountry} vs ${c.awayCountry}`;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackTweets(c, matchup);

  const teams = c.involvedTeams.length ? c.involvedTeams : ["a Global Football Cup contender"];
  const prompt = `You are generating playful fan posts ("tweets") for a social feed about the Global Football Cup — a 16-player World Cup 2026 prediction game where each player has a team name and earns points predicting real match scores (an exact score is a "perfect game").

Each tweet is written by an over-the-top FAN of one specific Global Football Cup team. The fan ties a REAL match moment to their team's prediction fortunes.

FACTS (use ONLY these — never invent players, scores, teams, or standings):
${factSheet(c)}

Global Football Cup teams you may write as a fan of: ${teams.join(", ")}.

Write 3-5 short tweets. For each tweet return: fanOf (one of the GFC teams above), handle (a fun fan handle starting with @ that references that team), displayName (a fun fan display name referencing that team), and text.
Tweet rules:
- Sound like an excited, funny fan. 1-2 sentences.
- Tie a real moment (a goal or the final result) to a GFC angle: a team that predicted it, a perfect game made or broken, or a team rising in its group.
- MUST end with hashtags including the real matchup tag "${c.matchHashtag}" and "${REQUIRED_TAG}", plus 1-2 fun made-up hashtags.
- Be accurate to the FACTS. No markdown.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.98,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  fanOf: { type: "STRING" },
                  handle: { type: "STRING" },
                  displayName: { type: "STRING" },
                  text: { type: "STRING" },
                },
                required: ["fanOf", "text"],
              },
            },
          },
        }),
      },
    );
    if (!res.ok) return fallbackTweets(c, matchup);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return fallbackTweets(c, matchup);
    const parsed = JSON.parse(raw) as RawTweet[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fallbackTweets(c, matchup);
    return parsed
      .filter((t) => t && typeof t.text === "string" && typeof t.fanOf === "string")
      .slice(0, 5)
      .map((t) => ({
        fanOf: t.fanOf,
        handle: (t.handle && t.handle.startsWith("@")) ? t.handle : slugHandle(t.fanOf),
        displayName: t.displayName || `${t.fanOf} Fan`,
        text: enforceHashtags(t.text, c.matchHashtag),
        matchup,
      }));
  } catch {
    return fallbackTweets(c, matchup);
  }
}

function fallbackTweets(c: TweetContext, matchup: string): Omit<FauxTweet, "id" | "fixtureId" | "createdAt">[] {
  const out: Omit<FauxTweet, "id" | "fixtureId" | "createdAt">[] = [];
  const tag = (s: string) => enforceHashtags(s, c.matchHashtag);
  const top = c.scorers[c.scorers.length - 1];
  if (c.perfectPickers[0]) {
    out.push({
      fanOf: c.perfectPickers[0], handle: slugHandle(c.perfectPickers[0]), displayName: `${c.perfectPickers[0]} Diehard`,
      text: tag(`${c.homeCountry} ${c.homeScore}-${c.awayScore} ${c.awayCountry} — called it on the nose! ${c.perfectPickers[0]} with the PERFECT game! #CalledIt`),
      matchup,
    });
  }
  if (c.lostPerfect[0] && top) {
    out.push({
      fanOf: c.lostPerfect[0], handle: slugHandle(c.lostPerfect[0]), displayName: `${c.lostPerfect[0]} Faithful`,
      text: tag(`Noooo, ${top.player}'s goal just ruined ${c.lostPerfect[0]}'s perfect game... tragic. #CloseOne`),
      matchup,
    });
  }
  if (c.groupRisers[0]) {
    const r = c.groupRisers[0];
    out.push({
      fanOf: r.team, handle: slugHandle(r.team), displayName: `${r.team} Ultras`,
      text: tag(`After that ${c.homeCountry} ${c.homeScore}-${c.awayScore} ${c.awayCountry} result, ${r.team} has risen to FIRST in Group ${r.group}! Long may it last! #TopOfTheTable`),
      matchup,
    });
  }
  if (out.length === 0 && top) {
    const team = c.involvedTeams[0] ?? "GFC Faithful";
    out.push({
      fanOf: team, handle: slugHandle(team), displayName: `${team} Fan`,
      text: tag(`${top.player} scores for ${top.country}! What a game. #GoalAlert`),
      matchup,
    });
  }
  return out;
}
