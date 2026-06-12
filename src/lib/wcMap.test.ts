import { describe, it, expect } from "vitest";
import { normalizeGroupLabel, toGroupStandings } from "./wcMap";
import type { ApiStandingRow } from "./apiFootball";

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
