import { describe, it, expect } from "vitest";
import { buildBracket, resolveBracketWinners, type SeedRow } from "./bracket";

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

describe("resolveBracketWinners", () => {
  const noPoints = { r1: {}, sf: {}, final: {} };

  it("resolves nothing before any round has started", () => {
    const winners = resolveBracketWinners(rows, {
      points: noPoints,
      roundActive: { r1: false, sf: false, final: false },
    });
    expect(winners).toEqual({});
  });

  it("resolves only round 1 while later rounds are inactive", () => {
    // Seeds: 1 A1, 2 B1, 3 C1, 4 D1, 5 A2, 6 B2, 7 C2, 8 D2
    // M1 A1vD2, M2 B1vC2, M3 C1vB2, M4 D1vA2 — give the lower seed the upset.
    const winners = resolveBracketWinners(rows, {
      points: {
        r1: { D2: 5, A1: 2, C2: 6, B1: 1, B2: 4, C1: 3, A2: 7, D1: 0 },
        sf: {},
        final: {},
      },
      roundActive: { r1: true, sf: false, final: false },
    });
    expect(winners.M1).toBe("D2");
    expect(winners.M2).toBe("C2");
    expect(winners.M3).toBe("B2");
    expect(winners.M4).toBe("A2");
    expect(winners.SF1).toBeUndefined();
    expect(winners.F).toBeUndefined();
  });

  it("advances winners through the semis and final", () => {
    const winners = resolveBracketWinners(rows, {
      points: {
        r1: { A1: 9, D2: 1, B1: 9, C2: 1, C1: 9, B2: 1, D1: 9, A2: 1 },
        sf: { A1: 9, D1: 1, B1: 9, C1: 1 }, // SF1 A1 vs D1, SF2 B1 vs C1
        final: { A1: 9, B1: 1 },
      },
      roundActive: { r1: true, sf: true, final: true },
    });
    // R1 chalk: A1, B1, C1, D1 advance
    expect(winners.M1).toBe("A1");
    expect(winners.M4).toBe("D1");
    // Semis: SF1 = W(M1) A1 vs W(M4) D1 → A1; SF2 = W(M2) B1 vs W(M3) C1 → B1
    expect(winners.SF1).toBe("A1");
    expect(winners.SF2).toBe("B1");
    // Final: A1 vs B1 → A1
    expect(winners.F).toBe("A1");
  });

  it("breaks a round-point tie on cumulative (seed) points", () => {
    // M1 A1 (30 group pts) vs D2 (22). Equal round points → higher seed wins.
    const winners = resolveBracketWinners(rows, {
      points: { r1: { A1: 4, D2: 4 }, sf: {}, final: {} },
      roundActive: { r1: true, sf: false, final: false },
    });
    expect(winners.M1).toBe("A1");
  });
});
