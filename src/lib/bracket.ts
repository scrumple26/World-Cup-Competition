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

import { seedKnockout, resolveMatchup, type MatchupSide } from "./scoring";
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

/** The friends' bracket rounds, matching the keys used across the app. */
export type FriendBracketRound = "r1" | "sf" | "final";

/**
 * The players "still in the contest" heading INTO a given bracket round — i.e.
 * everyone with a matchup to play in that round.
 *   r1    → all 8 seeds (nobody's eliminated yet).
 *   sf    → the 4 winners of r1.
 *   final → the 2 winners of the semi-finals.
 *
 * `ready` is false when the round's entrants aren't fully known yet (a prior
 * round hasn't resolved), so callers can hold off — e.g. don't email
 * semi-finalists until the quarter-finals have actually decided who they are.
 */
export function survivorsForRound(
  b: Bracket,
  round: FriendBracketRound,
): { ready: boolean; teams: BracketTeam[] } {
  if (round === "r1") {
    return { ready: b.seeds.length >= 2, teams: b.seeds };
  }
  const matchups = round === "sf" ? b.sf : [b.final];
  const teams: BracketTeam[] = [];
  let ready = matchups.length > 0;
  for (const m of matchups) {
    if (!m.a || !m.b) {
      ready = false;
      continue;
    }
    teams.push(m.a, m.b);
  }
  return { ready, teams };
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

/** Per-round head-to-head points + which rounds have started scoring. */
export interface BracketRoundPoints {
  points: Record<"r1" | "sf" | "final", Record<string, number>>;
  /** A round is only resolved once it has a played/live WC fixture. */
  roundActive: Record<"r1" | "sf" | "final", boolean>;
}

/**
 * Resolve the live bracket winners from each round's head-to-head points.
 *
 * Rounds are resolved in order (r1 → sf → final) because a later round's
 * entrants are the previous round's winners. A round is only decided once it
 * has started scoring; until then later matchups stay TBD. Within a matchup the
 * higher round points wins, tie-broken by cumulative points then a coin flip
 * (see resolveMatchup).
 */
export function resolveBracketWinners(
  rows: SeedRow[],
  rp: BracketRoundPoints,
): Winners {
  // Cumulative tiebreak = seed (group) points + everything earned in the KO.
  const cumulative = new Map<string, number>();
  for (const r of rows) {
    const ko =
      (rp.points.r1[r.uid] ?? 0) +
      (rp.points.sf[r.uid] ?? 0) +
      (rp.points.final[r.uid] ?? 0);
    cumulative.set(r.uid, r.groupPoints + ko);
  }

  const winners: Winners = {};
  const round: ("r1" | "sf" | "final")[] = ["r1", "sf", "final"];
  for (const key of round) {
    if (!rp.roundActive[key]) continue;
    // Rebuild with the winners decided so far so this round's entrants are known.
    const b = buildBracket(rows, winners);
    const matchups =
      key === "r1" ? b.r1 : key === "sf" ? b.sf : [b.final];
    for (const m of matchups) {
      if (!m.a || !m.b) continue;
      const side = (uid: string): MatchupSide => ({
        uid,
        roundPoints: rp.points[key][uid] ?? 0,
        cumulative: cumulative.get(uid) ?? 0,
      });
      winners[m.id] = resolveMatchup(side(m.a.uid), side(m.b.uid)).uid;
    }
  }
  return winners;
}
