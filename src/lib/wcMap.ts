/** Mapping between API-Football payloads and our domain types. */

import type { ApiFixture, ApiStandingRow } from "./apiFootball";
import type { WcMatch } from "./types";
import { isGroupRound } from "./wc";
const LOCKED_MATCH_STATUSES = new Set(["FT", "AET", "PEN", "1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

/** A WC group standings table for one group (e.g. "Group A"). */
export interface WcGroupStanding {
  group: string; // "Group A"
  rows: {
    rank: number;
    teamId: number;
    teamName: string;
    logo: string;
    played: number;
    win: number;
    draw: number;
    lose: number;
    gf: number;
    ga: number;
    goalsDiff: number;
    points: number;
  }[];
}

/** Map an API-Football fixture to our compact WcMatch. */
export function toWcMatch(f: ApiFixture): WcMatch {
  return {
    id: f.fixture.id,
    round: f.league.round,
    kickoff: f.fixture.date,
    status: f.fixture.status.short,
    homeTeamId: f.teams.home.id,
    awayTeamId: f.teams.away.id,
    homeTeamName: f.teams.home.name,
    awayTeamName: f.teams.away.name,
    homeLogo: f.teams.home.logo,
    awayLogo: f.teams.away.logo,
    goals: { home: f.goals.home, away: f.goals.away },
    elapsed: f.fixture.status.elapsed,
  };
}

/**
 * Canonicalize an API-Football group label to "Group X".
 * API-Football labels the WC 2026 group tables "Group Stage - Group A" (and
 * also emits a junk "Group Stage" aggregate ranking table). We want the bare
 * "Group A" so the row survives the lettered-group filter and maps to doc id A.
 * Returns "" for anything without a single-letter group (e.g. "Group Stage").
 */
export function normalizeGroupLabel(raw: string): string {
  const m = raw.match(/Group\s+([A-Z])\b/);
  return m ? `Group ${m[1]}` : "";
}

/** Map API standings (array of groups) to our group standings shape. */
export function toGroupStandings(groups: ApiStandingRow[][]): WcGroupStanding[] {
  return groups
    .map((rows) => ({
      group: normalizeGroupLabel(rows[0]?.group ?? ""),
      rows: rows.map((r) => ({
        rank: r.rank,
        teamId: r.team.id,
        teamName: r.team.name,
        logo: r.team.logo,
        played: r.all.played,
        win: r.all.win,
        draw: r.all.draw,
        lose: r.all.lose,
        gf: r.all.goals.for,
        ga: r.all.goals.against,
        goalsDiff: r.goalsDiff,
        points: r.points,
      })),
    }))
    // Keep only real lettered groups (API sometimes returns extra ranking tables).
    .filter((g) => /^Group [A-Z]$/.test(g.group))
    .sort((a, b) => a.group.localeCompare(b.group));
}

/** Whether a match has a usable final result for scoring. */
export function isPlayed(m: WcMatch): boolean {
  return (
    m.goals.home !== null &&
    m.goals.away !== null &&
    ["FT", "AET", "PEN"].includes(m.status)
  );
}

/** Whether predictions for a match should be locked (kickoff passed). */
export function isLocked(m: WcMatch, now = Date.now()): boolean {
  const kickoffPassed = new Date(m.kickoff).getTime() <= now;
  if (kickoffPassed) return true;
  return LOCKED_MATCH_STATUSES.has(m.status);
}

/**
 * True while the knockout ("Finals") picks window is open: any knockout
 * fixture (QF/SF/Final and earlier KO rounds) whose kickoff hasn't passed yet.
 * Finals picks stay open until each match kicks off; individual matches still
 * lock one-by-one via {@link isLocked}.
 */
export function hasOpenKnockoutFixtures(matches: WcMatch[], now = Date.now()): boolean {
  return matches.some((m) => !isGroupRound(m.round) && !isLocked(m, now));
}

/**
 * Whether a user may edit their pick for a knockout fixture.
 * Normally a pick is editable until kickoff. With a manual admin unlock
 * (`meta/knockoutUnlock`), it stays editable until the match has a final
 * result — so an admin can let a player re-enter a pick that failed to save
 * before kickoff, even once the game is underway.
 */
export function isKnockoutPickEditable(m: WcMatch, manualUnlock: boolean, now = Date.now()): boolean {
  if (isGroupRound(m.round)) return false;
  if (manualUnlock) return !isPlayed(m);
  return !isLocked(m, now);
}
