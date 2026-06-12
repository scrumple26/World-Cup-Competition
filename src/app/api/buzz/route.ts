import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { getLiveFixtures, getMatchEvents } from "@/lib/apiFootball";
import {
  generatePreMatchTweets, generateHalftimeTweets, generateGoalBatchTweets, reconstructGoalEvents,
  type PreMatchPick, type PreMatchTweetContext, type HalftimeTweetContext,
} from "@/lib/social";
import { gatherManagerContext, type ManagerContext, type StrugglingManager } from "@/lib/managerBanter";
import type { UserProfile, WcMatch, MatchPrediction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // headroom for batched goal calls + 429 backoff

const PRE_LOWER_MIN = 15;   // tweet pre-match when kickoff is 15–45 min out
const PRE_UPPER_MIN = 45;
const HALF_LOOKBACK_MIN = 150; // matches that kicked off in the last ~2.5h may be at HT now
const GOAL_LOOKBACK_MIN = 170; // matches that kicked off in the last ~2.8h may still be live
// API-Football short status codes for an in-progress match.
const LIVE_STATES = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE"]);

function isoAt(now: number, offsetMin: number): string {
  return new Date(now + offsetMin * 60_000).toISOString();
}

function hashtagFor(home: string, away: string): string {
  const s = (x: string) => x.replace(/[^a-zA-Z0-9]/g, "");
  return `#${s(home)}vs${s(away)}`;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** All real+bot players' stored predictions for one fixture, with their profile. */
async function gatherPicks(
  db: Firestore,
  users: UserProfile[],
  fixtureId: number,
): Promise<{ u: UserProfile; home: number; away: number }[]> {
  const rows = await Promise.all(
    users.map(async (u) => {
      const snap = await db
        .collection("predictions").doc(u.uid)
        .collection("matches").doc(String(fixtureId))
        .get().catch(() => null);
      if (!snap || !snap.exists) return null;
      const p = snap.data() as MatchPrediction;
      return { u, home: p.home, away: p.away };
    }),
  );
  return rows.filter((r): r is { u: UserProfile; home: number; away: number } => r !== null);
}

/** team name → other team names in the same friend group. */
function buildGroupmates(users: UserProfile[]): Record<string, string[]> {
  const byGroup = new Map<string, string[]>();
  for (const u of users) {
    const arr = byGroup.get(u.friendGroup) ?? [];
    arr.push(u.teamName);
    byGroup.set(u.friendGroup, arr);
  }
  const out: Record<string, string[]> = {};
  for (const u of users) {
    out[u.teamName] = (byGroup.get(u.friendGroup) ?? []).filter((t) => t !== u.teamName);
  }
  return out;
}

async function storeTweets(
  db: Firestore,
  fixtureId: number,
  prefix: string,
  tweets: Awaited<ReturnType<typeof generatePreMatchTweets>>,
): Promise<number> {
  const now = new Date().toISOString();
  await Promise.all(tweets.map((t, i) => {
    const id = `${prefix}_${fixtureId}_${i}`;
    return db.collection("tweets").doc(id).set({ id, fixtureId, createdAt: now, ...t });
  }));
  return tweets.length;
}

async function runPreMatch(db: Firestore, users: UserProfile[], now: number, mc: ManagerContext) {
  const snap = await db.collection("wcMatches")
    .where("kickoff", ">=", isoAt(now, PRE_LOWER_MIN))
    .where("kickoff", "<=", isoAt(now, PRE_UPPER_MIN))
    .get().catch(() => null);
  if (!snap) return { fired: 0, matches: 0 };

  const groupmates = buildGroupmates(users);
  let fired = 0;
  for (const doc of snap.docs) {
    const m = doc.data() as WcMatch;
    const markerRef = db.collection("buzzMarkers").doc(String(m.id));
    const marker = (await markerRef.get()).data() ?? {};
    if (marker.pre) continue;

    const picks: PreMatchPick[] = (await gatherPicks(db, users, m.id)).map((r) => ({
      team: r.u.teamName, predHome: r.home, predAway: r.away, group: r.u.friendGroup,
    }));
    if (picks.length === 0) continue;

    const minutesToKickoff = Math.max(1, Math.round((new Date(m.kickoff).getTime() - now) / 60_000));
    const ctx: PreMatchTweetContext = {
      homeCountry: m.homeTeamName, awayCountry: m.awayTeamName,
      matchHashtag: hashtagFor(m.homeTeamName, m.awayTeamName),
      minutesToKickoff, picks, groupmates,
      managers: mc.managers, strugglers: mc.strugglers,
    };
    const tweets = await generatePreMatchTweets(ctx);
    if (tweets.length === 0) continue;
    await storeTweets(db, m.id, "pre", tweets);
    await markerRef.set({ pre: new Date().toISOString() }, { merge: true });
    fired += tweets.length;
  }
  return { fired, matches: snap.size };
}

async function runHalftime(db: Firestore, users: UserProfile[], now: number, mc: ManagerContext) {
  const snap = await db.collection("wcMatches")
    .where("kickoff", ">=", isoAt(now, -HALF_LOOKBACK_MIN))
    .where("kickoff", "<=", isoAt(now, -2))
    .get().catch(() => null);
  if (!snap || snap.empty) return { fired: 0, atHalftime: 0 };

  // Only matches we haven't half-tweeted yet are worth a live lookup.
  const candidates = snap.docs
    .map((d) => d.data() as WcMatch)
    .slice(0, 20);
  if (candidates.length === 0) return { fired: 0, atHalftime: 0 };

  const live = await getLiveFixtures(candidates.map((m) => m.id)).catch(() => []);
  const statusById = new Map(live.map((f) => [f.fixture.id, f]));

  let fired = 0;
  let atHalftime = 0;
  for (const m of candidates) {
    const fx = statusById.get(m.id);
    if (!fx || fx.fixture.status.short !== "HT") continue;
    atHalftime++;

    const markerRef = db.collection("buzzMarkers").doc(String(m.id));
    const marker = (await markerRef.get()).data() ?? {};
    if (marker.half) continue;

    const h = fx.goals.home ?? 0;
    const a = fx.goals.away ?? 0;
    const cur = sign(h - a);

    const onTrackPerfect: string[] = [];
    const onTrackOutcome: string[] = [];
    const wrongFooted: string[] = [];
    for (const r of await gatherPicks(db, users, m.id)) {
      if (r.home === h && r.away === a) onTrackPerfect.push(r.u.teamName);
      else if (sign(r.home - r.away) === cur) onTrackOutcome.push(r.u.teamName);
      else wrongFooted.push(r.u.teamName);
    }
    if (onTrackPerfect.length + onTrackOutcome.length + wrongFooted.length === 0) continue;

    // Wrong-footed teams (their call going the other way) are fair game for a
    // gentle manager ribbing on top of the standing/cold-run strugglers.
    const strugglers: StrugglingManager[] = [...mc.strugglers];
    const seen = new Set(strugglers.map((s) => s.team));
    for (const team of wrongFooted) {
      if (seen.has(team) || !mc.managers[team]) continue;
      strugglers.push({ team, manager: mc.managers[team], reason: "their call is going the wrong way at the break" });
      seen.add(team);
    }

    const ctx: HalftimeTweetContext = {
      homeCountry: m.homeTeamName, awayCountry: m.awayTeamName,
      matchHashtag: hashtagFor(m.homeTeamName, m.awayTeamName),
      homeScore: h, awayScore: a,
      onTrackPerfect, onTrackOutcome, wrongFooted,
      managers: mc.managers, strugglers,
    };
    const tweets = await generateHalftimeTweets(ctx);
    if (tweets.length === 0) continue;
    await storeTweets(db, m.id, "half", tweets);
    await markerRef.set({ half: new Date().toISOString() }, { merge: true });
    fired += tweets.length;
  }
  return { fired, atHalftime };
}

/**
 * Live goal buzz — fan tweets for goals, generated ONCE PER HALF (a single
 * Gemini call per half: the first half once it's over, the second half at full
 * time). Batching by half keeps us under the Gemini free-tier rate limit.
 *
 * Idempotent per half via buzzMarkers (goalsH1/goalsH2) and per goal via the
 * deterministic tweet doc id `goal_<fixtureId>_<goalIndex>` — the same id the
 * sync backfill uses, so the two never duplicate.
 */
async function runGoals(db: Firestore, users: UserProfile[], now: number, mc: ManagerContext) {
  const snap = await db.collection("wcMatches")
    .where("kickoff", ">=", isoAt(now, -GOAL_LOOKBACK_MIN))
    .where("kickoff", "<=", isoAt(now, -1))
    .get().catch(() => null);
  if (!snap || snap.empty) return { fired: 0, live: 0 };

  const candidates = snap.docs.map((d) => d.data() as WcMatch).slice(0, 20);
  const live = await getLiveFixtures(candidates.map((m) => m.id)).catch(() => []);
  const fxById = new Map(live.map((f) => [f.fixture.id, f]));

  let fired = 0;
  let liveCount = 0;
  for (const m of candidates) {
    const fx = fxById.get(m.id);
    if (!fx || !LIVE_STATES.has(fx.fixture.status.short)) continue;
    liveCount++;
    const status = fx.fixture.status.short;

    // A half is "closed" (ready to tweet) once the match has moved past it.
    const h1Ready = status !== "1H";                     // HT/2H/ET/BT/P/FT…
    const h2Ready = ["FT", "AET", "PEN"].includes(status);

    const markerRef = db.collection("buzzMarkers").doc(String(m.id));
    const marker = (await markerRef.get()).data() ?? {};
    if ((marker.goalsH1 || !h1Ready) && (marker.goalsH2 || !h2Ready)) continue;

    const events = await getMatchEvents(m.id).catch(() => []);
    const goals = events.filter((e) => e.type === "Goal" && e.detail !== "Missed Penalty");
    const picks = (await gatherPicks(db, users, m.id)).map((r) => ({ teamName: r.u.teamName, home: r.home, away: r.away }));
    const indexed = reconstructGoalEvents(
      goals.map((g) => ({
        side: g.team.id === m.homeTeamId ? "home" : "away",
        isOwnGoal: g.detail === "Own Goal",
        isPenalty: g.detail.includes("Penalty"),
        scorer: g.player?.name ?? "Someone",
        elapsed: g.time.elapsed + (g.time.extra ?? 0),
      })),
      m.homeTeamName, m.awayTeamName, picks,
    );

    for (const half of [1, 2] as const) {
      const ready = half === 1 ? h1Ready : h2Ready;
      const markerKey = half === 1 ? "goalsH1" : "goalsH2";
      if (!ready || marker[markerKey]) continue;

      const segment = indexed.filter((x) => x.half === half);
      if (segment.length > 0) {
        const tweets = await generateGoalBatchTweets({
          homeCountry: m.homeTeamName, awayCountry: m.awayTeamName,
          matchHashtag: hashtagFor(m.homeTeamName, m.awayTeamName),
          half, goals: segment.map((x) => x.event),
          managers: mc.managers, strugglers: mc.strugglers,
        });
        await Promise.all(segment.map((x, k) => {
          const t = tweets[k];
          if (!t) return Promise.resolve();
          const id = `goal_${m.id}_${x.index}`;
          return db.collection("tweets").doc(id).set({ id, fixtureId: m.id, createdAt: new Date().toISOString(), ...t });
        }));
        fired += segment.length;
      }
      // Mark the half done even if it had no goals, so we don't re-check it.
      await markerRef.set({ [markerKey]: new Date().toISOString() }, { merge: true });
    }
  }
  return { fired, live: liveCount };
}

/**
 * GET /api/buzz — generates pre-match (~30 min out), half-time, and live per-goal
 * fan tweets. Triggered by Vercel Cron (Authorization: Bearer CRON_SECRET);
 * admins may also call it. Idempotent per fixture/phase (buzzMarkers) and per
 * goal (deterministic tweet doc ids).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && auth === `Bearer ${secret}`;
  if (!isCron && !(await requireAdmin(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const now = Date.now();
  const users = (await db.collection("users").get()).docs.map((d) => d.data() as UserProfile);
  const mc = await gatherManagerContext(db, users);

  const pre = await runPreMatch(db, users, now, mc).catch(() => ({ fired: 0, matches: 0 }));
  const half = await runHalftime(db, users, now, mc).catch(() => ({ fired: 0, atHalftime: 0 }));
  const goals = await runGoals(db, users, now, mc).catch(() => ({ fired: 0, live: 0 }));

  return NextResponse.json({ ok: true, preMatch: pre, halftime: half, goals });
}
