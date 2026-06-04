/** Mapping between API-Football payloads and our domain types. */

import type { ApiFixture, ApiStandingRow } from "./apiFootball";
import type { WcMatch } from "./types";

/** A WC group standings table for one group (e.g. "Group A"). */
export interface WcGroupStanding {
  group: string; // "Group A"
  rows: {
    rank: number;
    teamId: number;
    teamName: string;
    logo: string;
    played: number;
    points: number;
    goalsDiff: number;
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
  };
}

/** Map API standings (array of groups) to our group standings shape. */
export function toGroupStandings(groups: ApiStandingRow[][]): WcGroupStanding[] {
  return groups
    .map((rows) => ({
      group: rows[0]?.group ?? "",
      rows: rows.map((r) => ({
        rank: r.rank,
        teamId: r.team.id,
        teamName: r.team.name,
        logo: r.team.logo,
        played: r.all.played,
        points: r.points,
        goalsDiff: r.goalsDiff,
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
  return new Date(m.kickoff).getTime() <= now || m.status !== "NS";
}
