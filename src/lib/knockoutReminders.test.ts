import { describe, it, expect } from "vitest";
import { buildBracket, survivorsForRound, type SeedRow } from "./bracket";
import {
  decideKnockoutReminders,
  REMIND_LEAD_MS,
  type KnockoutReminderInput,
} from "./knockoutReminders";
import {
  knockoutRoundOpenHtml,
  knockoutRoundOpenText,
  knockoutPickReminderHtml,
  knockoutPickReminderText,
  formatKickoff,
} from "./emailTemplates";

function mk(uid: string, g: "A" | "B" | "C" | "D", pts: number): SeedRow {
  return { uid, teamName: uid, friendGroup: g, groupPoints: pts, perfectScores: 0, perfectGroups: 0 };
}

const rows: SeedRow[] = [
  mk("A1", "A", 30), mk("A2", "A", 25), mk("A3", "A", 10), mk("A4", "A", 5),
  mk("B1", "B", 28), mk("B2", "B", 24), mk("B3", "B", 9), mk("B4", "B", 4),
  mk("C1", "C", 27), mk("C2", "C", 23), mk("C3", "C", 8), mk("C4", "C", 3),
  mk("D1", "D", 26), mk("D2", "D", 22), mk("D3", "D", 7), mk("D4", "D", 2),
];

// Seeds: 1 A1, 2 B1, 3 C1, 4 D1, 5 A2, 6 B2, 7 C2, 8 D2.
// r1 chalk winners (top seed advances in each of M1..M4).
const R1_WINNERS = { M1: "A1", M2: "B1", M3: "C1", M4: "D1" };
const SF_WINNERS = { ...R1_WINNERS, SF1: "A1", SF2: "B1" };

describe("survivorsForRound", () => {
  it("r1 = all 8 seeds, always ready once seeded", () => {
    const s = survivorsForRound(buildBracket(rows), "r1");
    expect(s.ready).toBe(true);
    expect(s.teams.map((t) => t.uid)).toEqual(["A1", "B1", "C1", "D1", "A2", "B2", "C2", "D2"]);
  });

  it("sf not ready until r1 winners are resolved", () => {
    expect(survivorsForRound(buildBracket(rows), "sf").ready).toBe(false);
  });

  it("sf = the 4 r1 winners once resolved", () => {
    const s = survivorsForRound(buildBracket(rows, R1_WINNERS), "sf");
    expect(s.ready).toBe(true);
    expect(new Set(s.teams.map((t) => t.uid))).toEqual(new Set(["A1", "D1", "B1", "C1"]));
  });

  it("final = the 2 sf winners once resolved", () => {
    const s = survivorsForRound(buildBracket(rows, SF_WINNERS), "final");
    expect(s.ready).toBe(true);
    expect(new Set(s.teams.map((t) => t.uid))).toEqual(new Set(["A1", "B1"]));
  });
});

function baseInput(over: Partial<KnockoutReminderInput> = {}): KnockoutReminderInput {
  return {
    now: 1_000_000,
    started: true,
    bracket: buildBracket(rows),
    openFixtureCount: { r1: 0, sf: 0, final: 0 },
    firstKickoff: { r1: null, sf: null, final: null },
    unsubmittedByRound: { r1: [], sf: [], final: [] },
    state: {},
    ...over,
  };
}

describe("decideKnockoutReminders — round open", () => {
  it("sends nothing before the knockout starts", () => {
    const plan = decideKnockoutReminders(baseInput({ started: false, openFixtureCount: { r1: 4, sf: 0, final: 0 } }));
    expect(plan.open).toHaveLength(0);
    expect(plan.remind).toHaveLength(0);
  });

  it("emails all 8 survivors when r1 fixtures publish", () => {
    const plan = decideKnockoutReminders(baseInput({ openFixtureCount: { r1: 4, sf: 0, final: 0 } }));
    expect(plan.open).toHaveLength(1);
    expect(plan.open[0].round).toBe("r1");
    expect(plan.open[0].uids).toHaveLength(8);
  });

  it("does not re-send a round already announced", () => {
    const plan = decideKnockoutReminders(
      baseInput({ openFixtureCount: { r1: 4, sf: 0, final: 0 }, state: { open: { r1: { at: 1 } } } }),
    );
    expect(plan.open).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ round: "r1", kind: "open", reason: "already-sent" });
  });

  it("does not announce a round whose first game has already kicked off", () => {
    // Mirrors deploying mid-Round-of-32: fixtures published, survivors known,
    // but the round is already underway — the announcement would be stale.
    const plan = decideKnockoutReminders(
      baseInput({
        now: 5_000,
        openFixtureCount: { r1: 16, sf: 0, final: 0 },
        firstKickoff: { r1: 4_000, sf: null, final: null },
      }),
    );
    expect(plan.open).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ round: "r1", kind: "open", reason: "past-kickoff" });
  });

  it("holds the sf email until r1 has resolved its survivors", () => {
    // sf fixtures are published, but r1 winners aren't known yet → don't guess.
    const plan = decideKnockoutReminders(baseInput({ openFixtureCount: { r1: 0, sf: 2, final: 0 } }));
    expect(plan.open).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ round: "sf", kind: "open", reason: "survivors-unknown" });
  });

  it("emails the 4 semi-finalists once r1 has resolved", () => {
    const plan = decideKnockoutReminders(
      baseInput({ bracket: buildBracket(rows, R1_WINNERS), openFixtureCount: { r1: 4, sf: 2, final: 0 } }),
    );
    const sf = plan.open.find((e) => e.round === "sf");
    expect(sf?.uids).toHaveLength(4);
  });
});

describe("decideKnockoutReminders — 2h reminder", () => {
  const kickoff = 10_000_000;

  it("fires inside the 2h window to survivors who haven't picked", () => {
    const plan = decideKnockoutReminders(
      baseInput({
        now: kickoff - REMIND_LEAD_MS + 1,
        openFixtureCount: { r1: 4, sf: 0, final: 0 },
        firstKickoff: { r1: kickoff, sf: null, final: null },
        unsubmittedByRound: { r1: ["A1", "C2"], sf: [], final: [] },
        state: { open: { r1: { at: 1 } } }, // already announced; only the nudge is due
      }),
    );
    expect(plan.remind).toHaveLength(1);
    expect(plan.remind[0]).toEqual({ round: "r1", uids: ["A1", "C2"] });
  });

  it("does not fire before the window opens", () => {
    const plan = decideKnockoutReminders(
      baseInput({
        now: kickoff - REMIND_LEAD_MS - 1,
        openFixtureCount: { r1: 4, sf: 0, final: 0 },
        firstKickoff: { r1: kickoff, sf: null, final: null },
      }),
    );
    expect(plan.remind).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ round: "r1", kind: "remind2h", reason: "too-early" });
  });

  it("does not fire once the first game has kicked off", () => {
    const plan = decideKnockoutReminders(
      baseInput({
        now: kickoff + 1,
        openFixtureCount: { r1: 4, sf: 0, final: 0 },
        firstKickoff: { r1: kickoff, sf: null, final: null },
      }),
    );
    expect(plan.remind).toHaveLength(0);
    expect(plan.skipped).toContainEqual({ round: "r1", kind: "remind2h", reason: "past-kickoff" });
  });

  it("is idempotent once the reminder has been sent", () => {
    const plan = decideKnockoutReminders(
      baseInput({
        now: kickoff - 1000,
        firstKickoff: { r1: kickoff, sf: null, final: null },
        unsubmittedByRound: { r1: ["A1"], sf: [], final: [] },
        state: { open: { r1: { at: 1 } }, remind2h: { r1: { at: 1 } } },
      }),
    );
    expect(plan.remind).toHaveLength(0);
  });
});

describe("knockout email templates", () => {
  it("round-open copy names the stage, the WC picks and the predict link", () => {
    const html = knockoutRoundOpenHtml("Sam", "sf", null);
    expect(html).toContain("Semi-Final");
    expect(html).toContain("World Cup Round of 16");
    expect(html).toContain("https://globalfootballcup.com/predictions");
    expect(knockoutRoundOpenText("Sam", "sf", null)).toContain("still in the competition");
  });

  it("reminder copy warns about the 2-hour lock and missing picks", () => {
    const html = knockoutPickReminderHtml("Sam", "final", null);
    expect(html).toContain("2 hours");
    expect(html).toContain("haven't submitted your picks");
    expect(knockoutPickReminderText("", "r1", null)).toContain("Hi there,"); // empty name fallback
  });

  it("formatKickoff is null-safe and renders a date otherwise", () => {
    expect(formatKickoff(null)).toBe("");
    expect(formatKickoff(Date.UTC(2026, 5, 20, 16, 0))).toMatch(/2026|Jun|20/);
  });
});
