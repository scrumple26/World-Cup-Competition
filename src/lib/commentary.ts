import "server-only";

import type { PunditLine, PunditSpeaker, MatchScorer, FeedLateDrama } from "./feedTypes";
import type { MatchStakes } from "./wc";

/**
 * AI pundit commentary via Google Gemini.
 *
 * Guardrails: the pundits may ONLY explain the result using the factual
 * `statLeaders` / `scorers` / `lateDrama` we pass in. The prompt forbids
 * inventing stats, players, or events. If the API key is missing or the call
 * fails, we fall back to a deterministic templated dialogue so the feed always
 * has something to show.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export interface StatLeaderLine {
  label: string;
  home: number;
  away: number;
  /** "home" | "away" | "even" */
  leader: "home" | "away" | "even";
  suffix?: string;
}

export interface CommentaryContext {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  scorers: MatchScorer[];
  statLeaders: StatLeaderLine[];
  lateDrama?: FeedLateDrama;
  /** Short human summaries of how league players' picks fared. */
  perfectPickers: string[];
  /** Names of players whose perfect pick swung in the final minutes. */
  lateSwingNote?: string;
  /** The match's round (e.g. "Round of 16", "Group Stage - 3"), for context. */
  round?: string;
  /** How much was riding on the game — drives the desk's intensity. */
  stakes?: MatchStakes;
}

export const PUNDIT_PROFILES = `You are scripting a lively desk segment with three retired USMNT legends turned pundits:
- "dempsey" = Clint Dempsey: blunt, dry Texan swagger, attacker's eye, calls out finishing and grit. Career flex: scored in THREE World Cups (2006, 2010 vs England, 2014 — a goal ~30 seconds in vs Ghana, one of the fastest in WC history).
- "howard" = Tim Howard: goalkeeper's lens, obsessed with defending and keeping, animated. Career flex: 15 saves vs Belgium at the 2014 World Cup, the most in a WC match in the modern era — they called him "Secretary of Defense."
- "donovan" = Landon Donovan: measured analyst, tactics and movement, the calm voice. Career flex: the 91st-minute stoppage-time winner vs Algeria in 2010 that won the group — peak USA drama.

Voice rules:
- They talk TO each other by first name (Clint/Tim/Landon), react, agree and DISAGREE — banter, not three monologues.
- They SHOULD occasionally rib and jest each other (Tim teasing the strikers for missing, Clint needling Landon, etc.).
- They MAY occasionally (not every line) reference their own World Cup moments above when it fits — keep it natural and brief, never forced.`;

function buildPrompt(ctx: CommentaryContext): string {
  const facts: string[] = [];
  facts.push(`Final score: ${ctx.homeTeam} ${ctx.homeScore}–${ctx.awayScore} ${ctx.awayTeam}.`);
  const winner = ctx.homeScore > ctx.awayScore ? ctx.homeTeam
    : ctx.awayScore > ctx.homeScore ? ctx.awayTeam : null;
  facts.push(winner ? `${winner} won.` : `It ended a draw.`);
  if (ctx.scorers.length) {
    facts.push("Scorers: " + ctx.scorers.map((s) => {
      const team = s.side === "home" ? ctx.homeTeam : ctx.awayTeam;
      const tag = s.kind === "owngoal" ? " (own goal)" : s.kind === "penalty" ? " (pen)" : "";
      return `${s.player} ${s.minute}'${tag} for ${team}`;
    }).join("; ") + ".");
  }
  if (ctx.statLeaders.length) {
    facts.push("Team stats (home vs away): " + ctx.statLeaders
      .map((s) => `${s.label} ${s.home}${s.suffix ?? ""}-${s.away}${s.suffix ?? ""}`)
      .join(", ") + ".");
  }
  if (ctx.lateDrama) {
    const d = ctx.lateDrama;
    facts.push(`Late drama: ${d.scoringTeam} scored in the ${d.elapsed}'${d.varInvolved ? " after a VAR check" : ""}.`);
    if (d.lostPerfect.length) facts.push(`This goal COST these players their exact-score (perfect) pick: ${d.lostPerfect.join(", ")}.`);
    if (d.gainedPerfect.length) facts.push(`This goal HANDED these players a perfect pick: ${d.gainedPerfect.join(", ")}.`);
    if (d.lostOutcome.length) facts.push(`It flipped the result against: ${d.lostOutcome.join(", ")}.`);
    if (d.gainedOutcome.length) facts.push(`It rescued the result for: ${d.gainedOutcome.join(", ")}.`);
  }
  if (ctx.perfectPickers.length) facts.push(`Players who nailed the exact score: ${ctx.perfectPickers.join(", ")}.`);

  // Stakes framing — drives how hard the desk leans into the drama.
  let intensity: string;
  if (ctx.stakes === "knockout") {
    facts.push(`This was a ${ctx.round ?? "knockout"} match — win or go home; a loss ends a team's tournament.`);
    intensity = "STAKES ARE HUGE — this is a KNOCKOUT tie, win-or-go-home. Crank the intensity up: every moment feels season-defining, the desk is on the edge of their seats, voices raised, the emotion operatic. The prediction-league points here matter more than ever.";
  } else if (ctx.stakes === "qualifier") {
    facts.push(`This was a final group-stage game — qualification was on the line; the result sends teams through or knocks them out.`);
    intensity = "STAKES ARE HIGH — it's the FINAL group game with qualification on the line. Play up the do-or-die tension: who's through, who's crashing out, and what it swings in the prediction race.";
  } else {
    intensity = "It's a group-stage game — keep it lively and fun, but don't over-inflate the do-or-die theatrics.";
  }

  const OPENERS = [
    "the late drama and who it made or broke",
    "why the winning side deserved it (or got away with one)",
    "a standout individual performance",
    "the prediction-league carnage — whose picks blew up",
    "a goalkeeping or defensive talking point",
    "an attacking moment that swung it",
    "a hot take one of them can't wait to argue about",
  ];
  const MOODS = [
    "raucous and loud, half-talking over each other",
    "sharp and forensic, really digging into WHY it happened",
    "salty and argumentative — they can't agree on anything today",
    "warm and nostalgic, the old war stories flowing freely",
    "giddy and buzzing off the sheer drama of it",
    "dry and deadpan, needling each other between real points",
  ];
  const STRUCTURES = [
    "Open mid-argument, as if we've cut in on a disagreement already in full swing.",
    "Open with a blunt one-line hot take, then have the others pile on or push back.",
    "Open with one pundit putting a pointed question straight to another.",
    "Open with a vivid scene-setter about the single moment that decided it.",
    "Open with someone flat-out refusing to believe the result.",
  ];
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const opener = pick(OPENERS);
  const mood = pick(MOODS);
  const structure = pick(STRUCTURES);
  const firstSpeaker = pick(SPEAKERS);

  return `${PUNDIT_PROFILES}

You're scripting the post-match desk for the Global Football Cup (a 17-player World Cup prediction competition). This is must-watch TV — three big personalities with real chemistry reacting to the game that just ended. Let them rip.

FACTS (every factual claim — score, players, stats, who made/lost a perfect pick — must come from here; you may dramatize, joke, and give opinions, but never invent facts):
${facts.map((f) => "- " + f).join("\n")}

TODAY'S TONE: the desk is ${mood}. ${intensity}

RULES:
- EXACTLY 6 lines. ${firstSpeaker} OPENS. ${structure} The opening must be about the REAL match — the goal/result and why it happened (lead on ${opener}); no prediction-game talk in line 1.
- Lines 2-6 stay anchored to the real match but increasingly weave in the Global Football Cup angle (who predicted it, whose perfect game was made or broken, standings movement) — naturally and conversationally, not forced or every line.
- Fresh angle, structure, and phrasing every single time — never settle into the same rhythm or reuse a stock opening.
- Make it ALIVE: react with excitement, disbelief or sympathy; address each other by name; ask each other real questions and actually answer them; interrupt, agree, and disagree.
- Keep the voices DISTINCT: Dempsey blunt and swaggering about the attack; Howard fired up about goalkeeping/defending and quick to chirp the strikers; Donovan the smooth tactician who reins them in.
- Banter, ribbing, and the odd "back in my World Cup days…" memory are the SEASONING (about 1 in 4 lines) — the rest is real insight into why the winner won (lean on the team stats) and the prediction-league drama.
- If there was late drama, make it the centerpiece — name the player whose perfect pick was made or broken, and call out VAR if it was involved, with the emotion it deserves.
- Mention a standout scorer's impact if scorers are listed.
- Give each turn ROOM: most lines should be 2-3 full sentences (up to ~400 characters) that actually develop a point — avoid clipped one-liners. A short quip is fine occasionally for rhythm.
- No markdown, no emojis.`;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

const SPEAKERS: PunditSpeaker[] = ["dempsey", "howard", "donovan"];

function isValidLine(x: unknown): x is PunditLine {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return SPEAKERS.includes(o.speaker as PunditSpeaker) && typeof o.text === "string" && o.text.trim().length > 0;
}

/** Generate pundit-desk dialogue. Falls back to a template on any failure. */
export async function generatePunditCommentary(ctx: CommentaryContext): Promise<PunditLine[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackCommentary(ctx);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(ctx) }] }],
          generationConfig: {
            temperature: 0.97,
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  speaker: { type: "STRING", enum: SPEAKERS },
                  text: { type: "STRING" },
                },
                required: ["speaker", "text"],
              },
            },
          },
        }),
      },
    );
    if (!res.ok) return fallbackCommentary(ctx);
    const data = (await res.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return fallbackCommentary(ctx);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallbackCommentary(ctx);
    const lines = parsed.filter(isValidLine).map((l) => ({ speaker: l.speaker, text: l.text.trim() }));
    return (lines.length >= 2 ? lines : fallbackCommentary(ctx)).slice(0, 6);
  } catch {
    return fallbackCommentary(ctx);
  }
}

/** Deterministic dialogue used when AI is unavailable. */
export function fallbackCommentary(ctx: CommentaryContext): PunditLine[] {
  const winner = ctx.homeScore > ctx.awayScore ? ctx.homeTeam
    : ctx.awayScore > ctx.homeScore ? ctx.awayTeam : null;
  const lines: PunditLine[] = [];
  lines.push({
    speaker: "donovan",
    text: winner
      ? `${winner} take it, ${ctx.homeTeam} ${ctx.homeScore}–${ctx.awayScore} ${ctx.awayTeam}.`
      : `Honors even, ${ctx.homeScore}–${ctx.awayScore} between ${ctx.homeTeam} and ${ctx.awayTeam}.`,
  });
  const shots = ctx.statLeaders.find((s) => s.label.toLowerCase().includes("shot"));
  if (shots && shots.leader !== "even") {
    const who = shots.leader === "home" ? ctx.homeTeam : ctx.awayTeam;
    lines.push({ speaker: "dempsey", text: `${who} earned it — ${shots.home}-${shots.away} on shots. You make the chances count, you win games.` });
  } else {
    lines.push({ speaker: "dempsey", text: `Tight one, Landon. Not much in it on the numbers.` });
  }
  if (ctx.lateDrama) {
    const d = ctx.lateDrama;
    const broke = d.lostPerfect[0] ?? d.lostOutcome[0];
    const made = d.gainedPerfect[0] ?? d.gainedOutcome[0];
    if (broke) lines.push({ speaker: "howard", text: `Brutal — ${d.scoringTeam}'s ${d.elapsed}' goal${d.varInvolved ? ", and VAR waved it through," : ""} ripped a perfect pick away from ${broke}.` });
    else if (made) lines.push({ speaker: "howard", text: `That ${d.elapsed}' strike${d.varInvolved ? " — VAR confirmed —" : ""} just handed ${made} a perfect pick. Unreal timing.` });
  }
  if (ctx.scorers[0]) {
    const s = ctx.scorers[0];
    lines.push({ speaker: "donovan", text: `${s.player} with the moment in the ${s.minute}' — that's the difference today.` });
  }
  if (ctx.perfectPickers.length) {
    lines.push({ speaker: "howard", text: `And full marks to ${ctx.perfectPickers.slice(0, 3).join(", ")} — called it on the nose.` });
  }
  return lines;
}
