/**
 * Pure builder for the friends' knockout bracket.
 *
 * Qualifiers (8): the 4 group winners (seeds 1–4), the 3 best group
 * runners-up (seeds 5–7), and a wildcard — the best remaining team anywhere
 * (seed 8). See seedKnockout() for the exact rule.
 * First round pairs 1v8, 2v7, 3v6, 4v5. Standard bracket flow:
 *   SF1 = W(M1) vs W(M4),  SF2 = W(M2) vs W(M3),  Final = W(SF1) vs W(SF2).
 * Before the knockout starts everything is "projected" from current standings.
 */

import { seedKnockout } from "./scoring";
import type { FriendGroup } from "./wc";

export interface BracketTeam {
  uid: string;
  teamName: string;
  friendGroup: FriendGroup;
  seed: number;
  points: number;
}

export interface BracketMatchup {
  id: string;
  round: "r1" | "sf" | "final";
  a: BracketTeam | null;
  b: BracketTeam | null;
  aLabel: string;
  bLabel: string;
  winnerUid?: string;
}

export interface Bracket {
  seeds: BracketTeam[];
  r1: BracketMatchup[];
  sf: BracketMatchup[];
  final: BracketMatchup;
}

export interface SeedRow {
  uid: string;
  teamName: string;
  friendGroup: FriendGroup;
  groupPoints: number;
  perfectScores: number;
  perfectGroups: number;
}

/** Optional resolved winners (uid per matchup id) once the knockout is played. */
export type Winners = Record<string, string>;

export function buildBracket(rows: SeedRow[], winners: Winners = {}): Bracket {
  const seededRows = seedKnockout(rows);
  const seeds: BracketTeam[] = seededRows.map((r, i) => ({
    uid: r.uid,
    teamName: r.teamName,
    friendGroup: r.friendGroup,
    seed: i + 1,
    points: r.groupPoints,
  }));

  // First round: 1v8, 2v7, 3v6, 4v5
  const pairOrder = [
    [0, 7],
    [1, 6],
    [2, 5],
    [3, 4],
  ];
  const r1: BracketMatchup[] = pairOrder.map(([hi, lo], i) => {
    const a = seeds[hi] ?? null;
    const b = seeds[lo] ?? null;
    const id = `M${i + 1}`;
    return {
      id,
      round: "r1",
      a,
      b,
      aLabel: a ? `#${a.seed} ${a.teamName}` : "TBD",
      bLabel: b ? `#${b.seed} ${b.teamName}` : "TBD",
      winnerUid: winners[id],
    };
  });

  const winnerOf = (m: BracketMatchup): BracketTeam | null => {
    if (!m.winnerUid) return null;
    return [m.a, m.b].find((t) => t?.uid === m.winnerUid) ?? null;
  };

  const sfPairs: [BracketMatchup, BracketMatchup][] = [
    [r1[0], r1[3]], // SF1: W(M1) vs W(M4)
    [r1[1], r1[2]], // SF2: W(M2) vs W(M3)
  ];
  const sf: BracketMatchup[] = sfPairs.map(([m1, m2], i) => {
    const id = `SF${i + 1}`;
    return {
      id,
      round: "sf",
      a: winnerOf(m1),
      b: winnerOf(m2),
      aLabel: `Winner ${m1.id}`,
      bLabel: `Winner ${m2.id}`,
      winnerUid: winners[id],
    };
  });

  const final: BracketMatchup = {
    id: "F",
    round: "final",
    a: winnerOf(sf[0]),
    b: winnerOf(sf[1]),
    aLabel: "Winner SF1",
    bLabel: "Winner SF2",
    winnerUid: winners["F"],
  };

  return { seeds, r1, sf, final };
}
