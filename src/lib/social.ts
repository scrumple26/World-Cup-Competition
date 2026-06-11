import "server-only";

import type { FauxTweet } from "./feedTypes";
import type { StrugglingManager } from "./managerBanter";

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
  managers?: Record<string, string>;      // team → manager (player) first name
  strugglers?: StrugglingManager[];        // managers fair game for playful ribbing
}

const REQUIRED_TAG = "#GlobalFootballWorldCup";

function slugHandle(team: string): string {
  const base = team.replace(/[^a-zA-Z0-9]/g, "");
  return `@${base || "GFC"}Fan`;
}

/**
 * Manager-banter facts + a rule allowing fans to playfully rib a struggling
 * team's "manager" (its player) by first name. Returns empty strings when no
 * manager data is supplied, so callers can inject unconditionally.
 */
function managerLines(
  involved: string[],
  managers?: Record<string, string>,
  strugglers?: StrugglingManager[],
): { facts: string; instruction: string } {
  if (!managers) return { facts: "", instruction: "" };
  const strug = strugglers ?? [];
  const names = new Set<string>([...involved, ...strug.map((s) => s.team)]);
  const mgrList = [...names].filter((t) => managers[t]).map((t) => `${managers[t]} manages ${t}`);
  const lines: string[] = [];
  if (mgrList.length) lines.push(`Team managers (a team's "manager" is its player, named by first name): ${mgrList.join("; ")}.`);
  if (strug.length) lines.push(`Managers under pressure (fair game for gentle, playful criticism): ${strug.map((s) => `${s.manager} of ${s.team} — ${s.reason}`).join("; ")}.`);
  const facts = lines.join("\n");
  const instruction = facts
    ? `- A fan MAY playfully roast a STRUGGLING team's MANAGER by first name (only managers listed as under pressure, or one whose prediction is badly off) — question their tactics, demand a new lineup or different team selection, like a fed-up-but-still-loving supporter. Keep it cheeky and affectionate, NEVER genuinely harsh or personal.`
    : "";
  return { facts, instruction };
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
  const ml = managerLines(teams, c.managers, c.strugglers);
  const prompt = `You are generating playful fan posts ("tweets") for a social feed about the Global Football Cup — a 17-player World Cup 2026 prediction game where each player has a team name and earns points predicting real match scores (an exact score is a "perfect game").

Each tweet is written by an over-the-top FAN of one specific Global Football Cup team. The fan ties a REAL match moment to their team's prediction fortunes.

FACTS (use ONLY these — never invent players, scores, teams, or standings):
${factSheet(c)}${ml.facts ? "\n" + ml.facts : ""}

Global Football Cup teams you may write as a fan of: ${teams.join(", ")}.

Write 3-5 short tweets. For each tweet return: fanOf (one of the GFC teams above), handle (a fun fan handle starting with @ that references that team), displayName (a fun fan display name referencing that team), and text.
Tweet rules:
- Sound like an excited, funny fan. 1-2 sentences.
- Tie a real moment (a goal or the final result) to a GFC angle: a team that predicted it, a perfect game made or broken, or a team rising in its group.
- You MAY banter or trash-talk another Global Football Cup team from the list above — a bit of playful beef between fanbases is encouraged (name them, chirp them, gloat over them).
${ml.instruction}
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

// ── Shared Gemini plumbing for the pre-match & halftime generators ─────────────

type TweetOut = Omit<FauxTweet, "id" | "fixtureId" | "createdAt">;

async function callTweetModel(prompt: string): Promise<RawTweet[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
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
                  fanOf: { type: "STRING" }, handle: { type: "STRING" },
                  displayName: { type: "STRING" }, text: { type: "STRING" },
                },
                required: ["fanOf", "text"],
              },
            },
          },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawTweet[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mapRaw(parsed: RawTweet[], matchHashtag: string, matchup: string, limit: number): TweetOut[] {
  return parsed
    .filter((t) => t && typeof t.text === "string" && typeof t.fanOf === "string")
    .slice(0, limit)
    .map((t) => ({
      fanOf: t.fanOf,
      handle: t.handle && t.handle.startsWith("@") ? t.handle : slugHandle(t.fanOf),
      displayName: t.displayName || `${t.fanOf} Fan`,
      text: enforceHashtags(t.text, matchHashtag),
      matchup,
    }));
}

// ── Pre-match buzz: ~30 min before kickoff, fans hype or trash predictions ─────

export interface PreMatchPick {
  team: string;
  predHome: number;
  predAway: number;
  group: string;
}

export interface PreMatchTweetContext {
  homeCountry: string;
  awayCountry: string;
  matchHashtag: string;
  minutesToKickoff: number;
  picks: PreMatchPick[];
  /** team name → other team names in the same friend group (for rival name-drops). */
  groupmates: Record<string, string[]>;
  managers?: Record<string, string>;
  strugglers?: StrugglingManager[];
}

export async function generatePreMatchTweets(c: PreMatchTweetContext): Promise<TweetOut[]> {
  const matchup = `${c.homeCountry} vs ${c.awayCountry}`;
  if (c.picks.length === 0) return [];
  const ml = managerLines(c.picks.map((p) => p.team), c.managers, c.strugglers);

  const picksLines = c.picks
    .map((p) => {
      const rivals = c.groupmates[p.team] ?? [];
      return `${p.team} (Group ${p.group}) predicts ${c.homeCountry} ${p.predHome}-${p.predAway} ${c.awayCountry}` +
        (rivals.length ? ` [group rivals: ${rivals.join(", ")}]` : "");
    })
    .join("\n");

  const prompt = `You are generating playful fan posts ("tweets") for the Global Football Cup — a 17-player World Cup 2026 prediction game where each player has a team name and earns points predicting real match scores (an exact score is a "perfect game"). Players compete in groups (A–D).

It is about ${c.minutesToKickoff} minutes BEFORE kickoff of a real World Cup match: ${matchup}. Fans are hyping up or trash-talking each other's PREDICTIONS for this game — the match hasn't started, so this is all bravado, no results.

FACTS (use ONLY these — never invent players, scores, teams, or standings):
- Upcoming match: ${matchup}, kicking off in about ${c.minutesToKickoff} minutes.
- Global Football Cup predictions for this match:
${picksLines}${ml.facts ? "\n" + ml.facts : ""}

Write 1-2 short tweets. Each is written by a FAN of one of the Global Football Cup teams above, and must either:
  (a) CHAMPION a prediction — back a team's predicted scoreline as a genius call, or
  (b) TRASH a prediction — mock a team's predicted scoreline as delusional / way off.
The fan SHOULD banter another Global Football Cup team to stir the pot — call out a team's listed group rivals especially, or any other team in the predictions above (e.g. "even {rival} wouldn't be this bold", or chirping a team for a cowardly safe pick).
For each tweet return: fanOf (one of the GFC teams above), handle (a fun @handle referencing that team), displayName (a fun fan name), and text.
Rules:
- Excited, funny, slightly unhinged fan energy. 1-2 sentences. PRE-GAME bravado only — never describe what happens in the match.
${ml.instruction}
- MUST end with hashtags including "${c.matchHashtag}" and "${REQUIRED_TAG}", plus 1-2 fun made-up hashtags.
- No markdown.`;

  const parsed = await callTweetModel(prompt);
  if (!parsed || parsed.length === 0) return fallbackPreMatch(c, matchup);
  const mapped = mapRaw(parsed, c.matchHashtag, matchup, 2);
  return mapped.length ? mapped : fallbackPreMatch(c, matchup);
}

function fallbackPreMatch(c: PreMatchTweetContext, matchup: string): TweetOut[] {
  const tag = (s: string) => enforceHashtags(s, c.matchHashtag);
  const p = c.picks[0];
  if (!p) return [];
  const rival = (c.groupmates[p.team] ?? [])[0];
  return [{
    fanOf: p.team,
    handle: slugHandle(p.team),
    displayName: `${p.team} Believer`,
    text: tag(`${c.matchHashtag ? "" : ""}${p.team} calling it ${c.homeCountry} ${p.predHome}-${p.predAway} ${c.awayCountry} and locking it in. Bold? ${rival ? `${rival} would NEVER have the nerve. ` : ""}Trust the process. #LockedIn`),
    matchup,
  }];
}

// ── Halftime buzz: a fan reacts to the live HT state through the GFC lens ───────

export interface HalftimeTweetContext {
  homeCountry: string;
  awayCountry: string;
  matchHashtag: string;
  homeScore: number;
  awayScore: number;
  /** GFC teams whose predicted FINAL score equals the current HT score (a perfect game if it ends now). */
  onTrackPerfect: string[];
  /** GFC teams with the right RESULT so far (but not the exact score). */
  onTrackOutcome: string[];
  /** GFC teams who predicted the opposite result and are currently losing the bet. */
  wrongFooted: string[];
  managers?: Record<string, string>;
  strugglers?: StrugglingManager[];
}

export async function generateHalftimeTweets(c: HalftimeTweetContext): Promise<TweetOut[]> {
  const matchup = `${c.homeCountry} vs ${c.awayCountry}`;
  const involved = [...c.onTrackPerfect, ...c.onTrackOutcome, ...c.wrongFooted];
  if (involved.length === 0) return [];
  const ml = managerLines(involved, c.managers, c.strugglers);

  const f: string[] = [`HALF-TIME score: ${c.homeCountry} ${c.homeScore}-${c.awayScore} ${c.awayCountry}.`];
  if (c.onTrackPerfect.length) f.push(`If it ENDS like this, these GFC teams land a PERFECT game (exact score): ${c.onTrackPerfect.join(", ")}.`);
  if (c.onTrackOutcome.length) f.push(`These GFC teams have the right RESULT so far (not the exact score): ${c.onTrackOutcome.join(", ")}.`);
  if (c.wrongFooted.length) f.push(`These GFC teams predicted the OTHER way and are sweating: ${c.wrongFooted.join(", ")}.`);

  const prompt = `You are generating playful fan posts ("tweets") for the Global Football Cup — a 17-player World Cup 2026 prediction game where each player earns points predicting real match scores (an exact score is a "perfect game").

It is HALF-TIME of a real World Cup match. A fan is reacting to how the live game is shaping up FOR THE PREDICTION RACE.

FACTS (use ONLY these — never invent players, scores, teams, or standings):
${f.join("\n")}${ml.facts ? "\n" + ml.facts : ""}

Write 1-2 short tweets. Each is written by a FAN of one of the Global Football Cup teams named above. Tie the half-time state to that team's prediction fortunes: someone 45 minutes from a perfect game, someone whose call is looking good, or someone sweating because the game's going the wrong way. For each tweet return: fanOf (one of the GFC teams above), handle (a fun @handle), displayName (a fun fan name), and text.
Rules:
- Excited, funny fan energy. 1-2 sentences. It's HALF-TIME — react to the score so far and the nerves, don't invent a final result.
- Fans MAY banter another Global Football Cup team named above — e.g. a sweating fan coping by chirping a team that's cruising, or a team on track gloating at the ones who are sweating.
${ml.instruction}
- MUST end with hashtags including "${c.matchHashtag}" and "${REQUIRED_TAG}", plus 1-2 fun made-up hashtags.
- No markdown.`;

  const parsed = await callTweetModel(prompt);
  if (!parsed || parsed.length === 0) return fallbackHalftime(c, matchup);
  const mapped = mapRaw(parsed, c.matchHashtag, matchup, 2);
  return mapped.length ? mapped : fallbackHalftime(c, matchup);
}

function fallbackHalftime(c: HalftimeTweetContext, matchup: string): TweetOut[] {
  const tag = (s: string) => enforceHashtags(s, c.matchHashtag);
  const score = `${c.homeCountry} ${c.homeScore}-${c.awayScore} ${c.awayCountry}`;
  const star = c.onTrackPerfect[0] ?? c.onTrackOutcome[0];
  if (star) {
    return [{
      fanOf: star, handle: slugHandle(star), displayName: `${star} Faithful`,
      text: tag(`HT: ${score}. ${star} is 45 minutes from glory — hold the line! #HalfTime`),
      matchup,
    }];
  }
  if (c.wrongFooted[0]) {
    return [{
      fanOf: c.wrongFooted[0], handle: slugHandle(c.wrongFooted[0]), displayName: `${c.wrongFooted[0]} Faithful`,
      text: tag(`HT: ${score} and ${c.wrongFooted[0]} is sweating buckets — this is NOT going to plan. #HalfTime`),
      matchup,
    }];
  }
  return [];
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
