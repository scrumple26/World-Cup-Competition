import { describe, it, expect } from "vitest";
import {
  outcomeOf,
  scoreMatch,
  scoreGroupFinish,
  scoreThirdPlace,
  hashUid,
  rankStandings,
  seedKnockout,
  knockoutMatchups,
  resolveMatchup,
  POINTS,
  type StandingStats,
} from "./scoring";

describe("outcomeOf", () => {
  it("classifies home/draw/away", () => {
    expect(outcomeOf(2, 1)).toBe("home");
    expect(outcomeOf(1, 1)).toBe("draw");
    expect(outcomeOf(0, 3)).toBe("away");
  });
});

describe("scoreMatch", () => {
  it("perfect prediction = 3 (1 outcome + 0.5 + 0.5 + 1 bonus)", () => {
    const b = scoreMatch({ home: 2, away: 1 }, { home: 2, away: 1 });
    expect(b.total).toBe(3);
    expect(b.perfect).toBe(true);
    expect(b).toMatchObject({ outcome: 1, homeExact: 0.5, awayExact: 0.5, perfectBonus: 1 });
  });

  it("correct outcome only = 1", () => {
    const b = scoreMatch({ home: 3, away: 0 }, { home: 1, away: 0 });
    expect(b.outcome).toBe(1);
    expect(b.homeExact).toBe(0); // 3 != 1
    expect(b.awayExact).toBe(0.5); // 0 == 0
    expect(b.perfect).toBe(false);
    expect(b.total).toBe(1.5);
  });

  it("wrong outcome but one exact side = 0.5", () => {
    // predicted home win 2-1, actual away win 0-1: away goals exact, outcome wrong
    const b = scoreMatch({ home: 2, away: 1 }, { home: 0, away: 1 });
    expect(b.outcome).toBe(0);
    expect(b.awayExact).toBe(0.5);
    expect(b.homeExact).toBe(0);
    expect(b.perfect).toBe(false);
    expect(b.total).toBe(0.5);
  });

  it("completely wrong = 0", () => {
    const b = scoreMatch({ home: 0, away: 0 }, { home: 3, away: 1 });
    expect(b.total).toBe(0);
  });

  it("predicting a draw scoreline, exact, when it was a draw", () => {
    const b = scoreMatch({ home: 1, away: 1 }, { home: 1, away: 1 });
    expect(b.total).toBe(3);
  });

  it("knockout: predicted draw line but penalties decided a winner (override)", () => {
    // user predicted 1-1; match ended 1-1 then home won on pens.
    const b = scoreMatch({ home: 1, away: 1 }, { home: 1, away: 1 }, "home");
    // exact scores still credited, but outcome point lost (predicted draw, winner=home)
    expect(b.homeExact).toBe(0.5);
    expect(b.awayExact).toBe(0.5);
    expect(b.perfectBonus).toBe(1);
    expect(b.outcome).toBe(0);
    expect(b.total).toBe(2);
  });
});

describe("scoreGroupFinish", () => {
  const actual = [10, 20, 30, 40]; // teamIds 1st..4th
  it("perfect group = 4 positions + 2 bonus = 6", () => {
    const b = scoreGroupFinish([10, 20, 30, 40], actual);
    expect(b.correctCount).toBe(4);
    expect(b.perfect).toBe(true);
    expect(b.total).toBe(4 * POINTS.groupFinish + POINTS.perfectGroup);
    expect(b.total).toBe(6);
  });
  it("two correct positions, no bonus", () => {
    const b = scoreGroupFinish([10, 20, 40, 30], actual);
    expect(b.correctCount).toBe(2);
    expect(b.perfect).toBe(false);
    expect(b.total).toBe(2);
  });
  it("none correct = 0", () => {
    const b = scoreGroupFinish([40, 30, 20, 10], actual);
    expect(b.correctCount).toBe(0);
    expect(b.total).toBe(0);
  });
});

describe("scoreThirdPlace", () => {
  it("counts intersection regardless of order", () => {
    const actualAdvancing = [1, 2, 3, 4, 5, 6, 7, 8];
    const picked = [8, 7, 6, 5, 99, 98, 97, 96];
    const b = scoreThirdPlace(picked, actualAdvancing);
    expect(b.correctCount).toBe(4);
    expect(b.total).toBe(4);
  });
  it("all correct = 8", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(scoreThirdPlace(a, a).total).toBe(8);
  });
});

describe("hashUid", () => {
  it("is deterministic and stable", () => {
    expect(hashUid("alice")).toBe(hashUid("alice"));
    expect(hashUid("alice")).not.toBe(hashUid("bob"));
  });
});

describe("compareStanding / rankStandings", () => {
  const mk = (uid: string, gp: number, ps = 0, pg = 0): StandingStats => ({
    uid,
    groupPoints: gp,
    perfectScores: ps,
    perfectGroups: pg,
  });

  it("ranks by points desc first", () => {
    const ranked = rankStandings([mk("a", 5), mk("b", 9), mk("c", 7)]);
    expect(ranked.map((r) => r.uid)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by perfectScores then perfectGroups", () => {
    const ranked = rankStandings([
      mk("a", 10, 1, 0),
      mk("b", 10, 3, 0),
      mk("c", 10, 3, 1),
    ]);
    expect(ranked.map((r) => r.uid)).toEqual(["c", "b", "a"]);
  });

  it("fully tied rows fall back to deterministic uid hash", () => {
    const r1 = rankStandings([mk("zeta", 1), mk("alpha", 1)]);
    const r2 = rankStandings([mk("alpha", 1), mk("zeta", 1)]);
    expect(r1.map((r) => r.uid)).toEqual(r2.map((r) => r.uid)); // order independent of input order
  });
});

describe("seedKnockout", () => {
  type Row = StandingStats & { friendGroup: string };
  const mk = (uid: string, g: string, gp: number): Row => ({
    uid,
    friendGroup: g,
    groupPoints: gp,
    perfectScores: 0,
    perfectGroups: 0,
  });

  it("seeds 4 winners 1-4, 3 best runners-up 5-7, and a wildcard at 8", () => {
    const rows: Row[] = [
      // Group A: strong group — winner is low on points, but A3 (3rd) is high
      mk("A1", "A", 10), mk("A2", "A", 9), mk("A3", "A", 8),
      // Group B: a powerhouse — B2 runner-up has more points than every other winner
      mk("B1", "B", 30), mk("B2", "B", 29), mk("B3", "B", 2),
      // Group C
      mk("C1", "C", 20), mk("C2", "C", 5), mk("C3", "C", 1),
      // Group D: weak runner-up D2 (the 4th-best runner-up)
      mk("D1", "D", 15), mk("D2", "D", 4), mk("D3", "D", 3),
    ];
    const uids = seedKnockout(rows).map((s) => s.uid);
    expect(uids).toHaveLength(8);
    // Seeds 1-4: the four group winners ranked by points
    expect(uids.slice(0, 4)).toEqual(["B1", "C1", "D1", "A1"]);
    // A group winner (A1=10) still seeds above a higher-point runner-up (B2=29)
    expect(uids.indexOf("A1")).toBeLessThan(uids.indexOf("B2"));
    // Seeds 5-7: the three best runners-up
    expect(uids.slice(4, 7)).toEqual(["B2", "A2", "C2"]);
    // Seed 8: wildcard goes to A3 (8 pts), not the 4th runner-up D2 (4 pts)
    expect(uids[7]).toBe("A3");
    expect(uids).not.toContain("D2");
  });
});

describe("knockoutMatchups", () => {
  it("pairs highest vs lowest (1v8,2v7,3v6,4v5)", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(knockoutMatchups(seeds)).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });
  it("works for 2 (final)", () => {
    expect(knockoutMatchups(["x", "y"])).toEqual([["x", "y"]]);
  });
});

describe("resolveMatchup", () => {
  it("higher round points wins", () => {
    const w = resolveMatchup(
      { uid: "a", roundPoints: 5, cumulative: 50 },
      { uid: "b", roundPoints: 7, cumulative: 10 },
    );
    expect(w.uid).toBe("b");
  });
  it("tie on round points -> higher cumulative", () => {
    const w = resolveMatchup(
      { uid: "a", roundPoints: 5, cumulative: 50 },
      { uid: "b", roundPoints: 5, cumulative: 40 },
    );
    expect(w.uid).toBe("a");
  });
  it("full tie -> deterministic", () => {
    const x = { uid: "a", roundPoints: 5, cumulative: 50 };
    const y = { uid: "b", roundPoints: 5, cumulative: 50 };
    expect(resolveMatchup(x, y)).toEqual(resolveMatchup(y, x));
  });
});
