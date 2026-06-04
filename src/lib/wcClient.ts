"use client";

/** Client helpers for fetching WC data from our server routes (live API-Football). */

import type { WcMatch } from "./types";
import type { WcGroupStanding } from "./wcMap";
import type { MatchInsights } from "@/app/api/wc/match/[id]/insights/route";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchFixtures(round?: string): Promise<WcMatch[]> {
  const q = round ? `?round=${encodeURIComponent(round)}` : "";
  return getJson<{ matches: WcMatch[] }>(`/api/wc/fixtures${q}`).then((r) => r.matches);
}

export function fetchStandings(): Promise<WcGroupStanding[]> {
  return getJson<{ groups: WcGroupStanding[] }>(`/api/wc/standings`).then((r) => r.groups);
}

export function fetchInsights(fixtureId: number): Promise<MatchInsights> {
  return getJson<MatchInsights>(`/api/wc/match/${fixtureId}/insights`);
}

/** A WC group enriched with its teams and that group's matches. */
export interface GroupBundle {
  group: string; // "Group A"
  letter: string; // "A"
  teams: { id: number; name: string; logo: string }[];
  matches: WcMatch[];
}

/**
 * Combine standings (team→group membership + provisional order) with fixtures
 * to produce one bundle per WC group. Matches are attached by team membership.
 */
export function buildGroupBundles(
  standings: WcGroupStanding[],
  fixtures: WcMatch[],
): GroupBundle[] {
  const teamToGroup = new Map<number, string>();
  for (const g of standings) {
    for (const row of g.rows) teamToGroup.set(row.teamId, g.group);
  }
  const matchesByGroup = new Map<string, WcMatch[]>();
  for (const m of fixtures) {
    const grp = teamToGroup.get(m.homeTeamId) ?? teamToGroup.get(m.awayTeamId);
    if (!grp) continue;
    const arr = matchesByGroup.get(grp) ?? [];
    arr.push(m);
    matchesByGroup.set(grp, arr);
  }
  return standings.map((g) => ({
    group: g.group,
    letter: g.group.replace("Group ", ""),
    teams: g.rows.map((r) => ({ id: r.teamId, name: r.teamName, logo: r.logo })),
    matches: (matchesByGroup.get(g.group) ?? []).sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
    ),
  }));
}
