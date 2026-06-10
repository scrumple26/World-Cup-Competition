/**
 * Server-side API-Football client.
 *
 * SECURITY: this module must only ever run on the server. The API key is read
 * from process.env.API_FOOTBALL_KEY and must never be exposed to the browser.
 * A small in-memory TTL cache protects the 7,500/day quota during a single
 * server instance's lifetime; a durable Firestore cache is layered on in Phase 3.
 */

import "server-only";
import { WC_LEAGUE_ID, WC_SEASON } from "./wc";

const BASE =
  process.env.API_FOOTBALL_BASE ?? "https://v3.football.api-sports.io";

function apiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY is not set");
  return key;
}

// ---- API-Football response shapes (only the fields we use) ----

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    timezone: string;
    venue: { id: number | null; name: string | null; city: string | null };
    status: { long: string; short: string; elapsed: number | null };
  };
  league: { id: number; season: number; round: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

export interface ApiStandingRow {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
}

interface ApiEnvelope<T> {
  errors: unknown;
  results: number;
  response: T;
}

// ---- in-memory TTL cache ----

interface CacheEntry {
  expires: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();

function readCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  if (hit) cache.delete(key);
  return undefined;
}

/**
 * Low-level GET against API-Football with TTL caching.
 * @param path e.g. "fixtures"
 * @param params query string params
 * @param ttlMs cache lifetime; defaults to 5 minutes
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  ttlMs = 5 * 60_000,
): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${BASE}/${path}?${qs}`;

  const cached = readCache<T>(url);
  if (cached !== undefined) return cached;

  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey() },
    // Next.js fetch: don't use its data cache; we manage our own.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API-Football ${path} failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as ApiEnvelope<T>;
  if (
    body.errors &&
    !Array.isArray(body.errors) &&
    Object.keys(body.errors as object).length > 0
  ) {
    throw new Error(`API-Football ${path} errors: ${JSON.stringify(body.errors)}`);
  }
  cache.set(url, { expires: Date.now() + ttlMs, data: body.response });
  return body.response;
}

// ---- typed helpers ----

/** All WC fixtures for the configured league/season (optionally one round). */
export function getFixtures(round?: string): Promise<ApiFixture[]> {
  const params: Record<string, string | number> = {
    league: WC_LEAGUE_ID,
    season: WC_SEASON,
  };
  if (round) params.round = round;
  return apiGet<ApiFixture[]>("fixtures", params);
}

/** Distinct round names available for the league/season. */
export function getRounds(): Promise<string[]> {
  return apiGet<string[]>("fixtures/rounds", {
    league: WC_LEAGUE_ID,
    season: WC_SEASON,
  });
}

interface StandingsResponse {
  league: { standings: ApiStandingRow[][] };
}

/** Group standings as an array of groups, each an array of rows. */
export async function getStandings(): Promise<ApiStandingRow[][]> {
  const resp = await apiGet<StandingsResponse[]>(
    "standings",
    { league: WC_LEAGUE_ID, season: WC_SEASON },
    60_000, // 1-min freshness so live standings polling reflects in-match changes
  );
  return resp[0]?.league.standings ?? [];
}

// ---- live match detail types ----

export interface ApiMatchEvent {
  time: { elapsed: number; extra?: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;   // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | "Red Card" | "Red Card" | "Substitution 1" …
  comments: string | null;
}

export interface ApiMatchStatEntry {
  team: { id: number; name: string };
  statistics: { type: string; value: number | string | null }[];
}

/** Live events (goals, cards, subs) for a fixture (30s cache). */
export function getMatchEvents(fixtureId: number): Promise<ApiMatchEvent[]> {
  return apiGet<ApiMatchEvent[]>("fixtures/events", { fixture: fixtureId }, 30_000);
}

/** Live statistics (possession, shots, …) for a fixture (30s cache). */
export function getMatchStatistics(fixtureId: number): Promise<ApiMatchStatEntry[]> {
  return apiGet<ApiMatchStatEntry[]>("fixtures/statistics", { fixture: fixtureId }, 30_000);
}

/** Fetch live/current data for specific fixture IDs (short 30s cache). */
export function getLiveFixtures(fixtureIds: number[]): Promise<ApiFixture[]> {
  if (fixtureIds.length === 0) return Promise.resolve([]);
  const ids = fixtureIds.slice(0, 20).join("-"); // API-Football dash-separated
  return apiGet<ApiFixture[]>("fixtures", { ids }, 30_000);
}

/** API-Football predictions + comparison stats for a single fixture. */
export function getMatchInsights(fixtureId: number): Promise<unknown> {
  return apiGet<unknown>("predictions", { fixture: fixtureId }, 30 * 60_000);
}
