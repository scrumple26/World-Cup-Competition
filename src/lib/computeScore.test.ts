import { it, expect } from "vitest";
import { computeUserScore, type ActualData, type UserPredictions } from "./computeScore";

const actual: ActualData = {
  matches: [
    { id: 1, isGroupStage: true, home: 2, away: 1 }, // group
    { id: 2, isGroupStage: true, home: 0, away: 0 },
    { id: 3, isGroupStage: false, home: 1, away: 1, decidedWinner: "home" }, // KO pens
  ],
  completedGroupOrders: { "Group A": [10, 20, 30, 40] },
  thirdAdvancing: [30, 31, 32, 33, 34, 35, 36, 37],
};

it("aggregates match, group-finish and third-place points correctly", () => {
  const preds: UserPredictions = {
    matches: {
      1: { fixtureId: 1, home: 2, away: 1, submittedAt: 0 }, // perfect = 3, group
      2: { fixtureId: 2, home: 1, away: 1, submittedAt: 0 }, // draw correct = 1, group
      3: { fixtureId: 3, home: 1, away: 1, submittedAt: 0 }, // exact scores 0.5+0.5+1=2 but outcome wrong (home won) -> 2, KO
    },
    groupOrders: { "Group A": [10, 20, 40, 30] }, // 2 correct positions = 2
    thirdAdvancing: [30, 31, 99, 98, 97, 96, 95, 94], // 2 correct = 2
  };
  const s = computeUserScore(actual, preds);
  expect(s.groupPts).toBe(3 + 1 + 2 + 2); // matches(4) + finish(2) + third(2) = 8
  expect(s.knockoutPts).toBe(2);
  expect(s.total).toBe(10);
  // matches 1 and 3 both nailed the exact scoreline (3 counts the perfect bonus
  // even though penalties flipped the KO winner).
  expect(s.perfectScores).toBe(2);
  expect(s.perfectGroups).toBe(0);
});

it("ignores group finish + third place until completed", () => {
  const partial: ActualData = { matches: [], completedGroupOrders: {}, thirdAdvancing: null };
  const preds: UserPredictions = {
    matches: {},
    groupOrders: { "Group A": [1, 2, 3, 4] },
    thirdAdvancing: [3],
  };
  expect(computeUserScore(partial, preds).total).toBe(0);
});

it("awards perfect-group bonus", () => {
  const a: ActualData = {
    matches: [],
    completedGroupOrders: { "Group A": [10, 20, 30, 40] },
    thirdAdvancing: null,
  };
  const p: UserPredictions = {
    matches: {},
    groupOrders: { "Group A": [10, 20, 30, 40] },
    thirdAdvancing: [],
  };
  const s = computeUserScore(a, p);
  expect(s.groupPts).toBe(4 + 2); // 4 positions + perfect bonus
  expect(s.perfectGroups).toBe(1);
});
