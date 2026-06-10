import "server-only";

import type { PunditLine, PunditSpeaker, MatchScorer, FeedLateDrama } from "./feedTypes";

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

  return `${PUNDIT_PROFILES}

Write the desk segment about this match for a friends' World Cup prediction league.

FACTS (use ONLY these — do not invent any stat, player, goal, or event not listed):
${facts.map((f) => "- " + f).join("\n")}

RULES:
- 6 to 9 lines, a genuine back-and-forth: one pundit asks a question, another answers; they interrupt, agree and disagree. Conversational, not three separate monologues.
- They should rib and tease each other, and occasionally (not every line) recollect their own World Cup playing days.
- Explain WHY the winner won using ONLY the team stats above (e.g. shots, possession). If stats are even or missing, say it was tight — don't fabricate.
- If there was late drama, make it the centerpiece: name the player whose perfect pick was made or broken, and (if noted) that VAR was involved.
- Mention a standout scorer's impact if scorers are listed.
- Keep each line under ~240 characters. No markdown, no emojis.`;
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
            temperature: 0.95,
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
    return lines.length >= 2 ? lines : fallbackCommentary(ctx);
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
