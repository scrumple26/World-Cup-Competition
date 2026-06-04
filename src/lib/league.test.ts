import { describe, it, expect } from "vitest";
import { buildGroupStandings, buildLeaderboard, buildChartSeries } from "./league";
import type { ScoreDoc, UserProfile } from "./types";

function user(uid: string, group: "A" | "B" | "C" | "D"): UserProfile {
  return { uid, email: `${uid}@x.com`, teamName: uid, friendGroup: group, isAdmin: false, createdAt: 0 };
}
function score(uid: string, total: number, ps = 0, pg = 0): ScoreDoc {
  return { uid, groupPts: total, knockoutPts: 0, total, perfectScores: ps, perfectGroups: pg, history: [] };
}

describe("buildGroupStandings", () => {
  it("ranks each group and marks top 2 qualified", () => {
    const users = [user("a", "A"), user("b", "A"), user("c", "A"), user("d", "A")];
    const scores = {
      a: score("a", 5),
      b: score("b", 9),
      c: score("c", 7),
      d: score("d", 1),
    };
    const standings = buildGroupStandings(users, scores);
    expect(standings.A.map((r) => r.user.uid)).toEqual(["b", "c", "a", "d"]);
    expect(standings.A.filter((r) => r.qualified).map((r) => r.user.uid)).toEqual(["b", "c"]);
  });
});

describe("buildLeaderboard", () => {
  it("orders all users by total with perfect-score tiebreak", () => {
    const users = [user("a", "A"), user("b", "B")];
    const lb = buildLeaderboard(users, { a: score("a", 10, 1), b: score("b", 10, 3) });
    expect(lb[0].user.uid).toBe("b"); // more perfect scores wins the tie
    expect(lb[0].rank).toBe(1);
  });
});

describe("buildChartSeries", () => {
  it("unions dates and carries values forward", () => {
    const { data, keys } = buildChartSeries([
      { teamName: "X", history: [{ date: "d1", total: 2 }, { date: "d2", total: 5 }] },
      { teamName: "Y", history: [{ date: "d1", total: 3 }] }, // missing d2 -> carry 3
    ]);
    expect(keys).toEqual(["X", "Y"]);
    expect(data).toEqual([
      { date: "d1", X: 2, Y: 3 },
      { date: "d2", X: 5, Y: 3 },
    ]);
  });
});
