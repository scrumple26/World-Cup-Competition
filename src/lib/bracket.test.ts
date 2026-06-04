import { describe, it, expect } from "vitest";
import { buildBracket, type SeedRow } from "./bracket";

function mk(uid: string, g: "A" | "B" | "C" | "D", pts: number): SeedRow {
  return { uid, teamName: uid, friendGroup: g, groupPoints: pts, perfectScores: 0, perfectGroups: 0 };
}

const rows: SeedRow[] = [
  mk("A1", "A", 30), mk("A2", "A", 25), mk("A3", "A", 10), mk("A4", "A", 5),
  mk("B1", "B", 28), mk("B2", "B", 24), mk("B3", "B", 9), mk("B4", "B", 4),
  mk("C1", "C", 27), mk("C2", "C", 23), mk("C3", "C", 8), mk("C4", "C", 3),
  mk("D1", "D", 26), mk("D2", "D", 22), mk("D3", "D", 7), mk("D4", "D", 2),
];

describe("buildBracket", () => {
  it("seeds top 2 per group 1-8 by points and pairs 1v8..4v5", () => {
    const b = buildBracket(rows);
    expect(b.seeds.map((s) => s.uid)).toEqual([
      "A1", "B1", "C1", "D1", "A2", "B2", "C2", "D2",
    ]);
    expect(b.r1).toHaveLength(4);
    // M1 = seed1 (A1) vs seed8 (D2)
    expect([b.r1[0].a?.uid, b.r1[0].b?.uid]).toEqual(["A1", "D2"]);
    // M4 = seed4 (D1) vs seed5 (A2)
    expect([b.r1[3].a?.uid, b.r1[3].b?.uid]).toEqual(["D1", "A2"]);
  });

  it("propagates winners into semis and final", () => {
    const b = buildBracket(rows, { M1: "A1", M4: "A2", M2: "B1", M3: "C1", SF1: "A1", SF2: "B1", F: "A1" });
    expect(b.sf[0].a?.uid).toBe("A1"); // W(M1)
    expect(b.sf[0].b?.uid).toBe("A2"); // W(M4)
    expect(b.final.a?.uid).toBe("A1"); // W(SF1)
    expect(b.final.b?.uid).toBe("B1"); // W(SF2)
    expect(b.final.winnerUid).toBe("A1");
  });
});
