import { describe, it, expect } from "vitest";
import { hasOpenKnockoutFixtures, isLocked, normalizeGroupLabel, toGroupStandings } from "./wcMap";
import type { ApiStandingRow } from "./apiFootball";
import type { WcMatch } from "./types";

describe("normalizeGroupLabel", () => {
  it("canonicalizes API-Football's 'Group Stage - Group X' to 'Group X'", () => {
    expect(normalizeGroupLabel("Group Stage - Group A")).toBe("Group A");
    expect(normalizeGroupLabel("Group Stage - Group L")).toBe("Group L");
  });
  it("accepts an already-canonical label", () => {
    expect(normalizeGroupLabel("Group C")).toBe("Group C");
  });
  it("rejects the junk aggregate ranking table", () => {
    expect(normalizeGroupLabel("Group Stage")).toBe("");
    expect(normalizeGroupLabel("")).toBe("");
  });
});

function row(name: string, group: string, played: number, points: number): ApiStandingRow {
  return {
    rank: 1,
    team: { id: name.length, name, logo: "" },
    points,
    goalsDiff: 0,
    group,
    all: { played, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
  };
}

describe("toGroupStandings", () => {
  it("keeps real lettered groups despite the 'Group Stage - Group X' label, drops the aggregate table", () => {
    const groups: ApiStandingRow[][] = [
      [row("Mexico", "Group Stage - Group A", 1, 3), row("South Africa", "Group Stage - Group A", 1, 0)],
      [row("Canada", "Group Stage - Group B", 0, 0)],
      [row("SomeTeam", "Group Stage", 1, 0)], // junk aggregate ranking table
    ];
    const out = toGroupStandings(groups);
    expect(out.map((g) => g.group)).toEqual(["Group A", "Group B"]);
    expect(out[0].rows[0].played).toBe(1);
    expect(out[0].rows[0].points).toBe(3);
  });

  it("returns empty when the API yields no standings", () => {
    expect(toGroupStandings([])).toEqual([]);
  });
});

describe("isLocked", () => {
  const futureKickoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const baseMatch: WcMatch = {
    id: 1,
    round: "Semi-finals",
    kickoff: futureKickoff,
    status: "NS",
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamName: "Home",
    awayTeamName: "Away",
    homeLogo: "",
    awayLogo: "",
    goals: { home: null, away: null },
  };

  it("keeps not-started TBD fixtures editable before kickoff", () => {
    expect(isLocked({ ...baseMatch, status: "TBD" })).toBe(false);
  });

  it("locks live fixtures", () => {
    expect(isLocked({ ...baseMatch, status: "1H" })).toBe(true);
  });
});

describe("hasOpenKnockoutFixtures", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const mk = (over: Partial<WcMatch>): WcMatch => ({
    id: 1, round: "Quarter-finals", kickoff: future, status: "NS",
    homeTeamId: 1, awayTeamId: 2, homeTeamName: "H", awayTeamName: "A",
    homeLogo: "", awayLogo: "", goals: { home: null, away: null }, ...over,
  });

  it("is true when a knockout fixture has not kicked off", () => {
    expect(hasOpenKnockoutFixtures([mk({ round: "Semi-finals", kickoff: future })])).toBe(true);
  });

  it("ignores group-stage fixtures", () => {
    expect(hasOpenKnockoutFixtures([mk({ round: "Group Stage - 1", kickoff: future })])).toBe(false);
  });

  it("is false once every knockout fixture has kicked off", () => {
    expect(
      hasOpenKnockoutFixtures([
        mk({ id: 1, round: "Semi-finals", kickoff: past, status: "FT" }),
        mk({ id: 2, round: "Final", kickoff: past, status: "1H" }),
      ]),
    ).toBe(false);
  });

  it("is true if any knockout fixture is still to come, even with earlier rounds done", () => {
    expect(
      hasOpenKnockoutFixtures([
        mk({ id: 1, round: "Round of 16", kickoff: past, status: "FT" }),
        mk({ id: 2, round: "Final", kickoff: future, status: "NS" }),
      ]),
    ).toBe(true);
  });
});
