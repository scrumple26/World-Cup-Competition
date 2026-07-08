"use client";

import { useEffect, useState } from "react";
import { fetchFixtures } from "@/lib/wcClient";
import { FRIEND_STAGE_WC_ROUNDS } from "@/lib/wc";
import { isLocked } from "@/lib/wcMap";
import type { MatchPrediction, Outcome, WcMatch } from "@/lib/types";
import { MatchPredictionCard, type SaveState } from "./MatchPredictionCard";

const FRIEND_ROUNDS: { key: "ko1" | "ko2" | "kofinal"; title: string; blurb: string }[] = [
  {
    key: "ko1",
    title: "Round 1 picks",
    blurb: "Predict every WC Round of 32 match.",
  },
  {
    key: "ko2",
    title: "Round 2 picks",
    blurb: "Predict every WC Round of 16 match.",
  },
  {
    key: "kofinal",
    title: "Finals picks",
    blurb: "Predict the WC Quarter-finals, Semi-finals & Final.",
  },
];

export function KnockoutPredictions({
  matches,
  saveStates,
  onMatchChange,
}: {
  matches: Record<number, MatchPrediction>;
  saveStates: Record<number, SaveState>;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => void;
}) {
  const [byRound, setByRound] = useState<Record<string, WcMatch[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const wcRounds = Array.from(new Set(Object.values(FRIEND_STAGE_WC_ROUNDS).flat()));
    Promise.all(
      wcRounds.map((r) =>
        fetchFixtures(r)
          .then((m) => [r, m] as const)
          .catch(() => [r, []] as const),
      ),
    )
      .then((entries) => {
        setByRound(Object.fromEntries(entries));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-[var(--muted)]">Loading knockout fixtures…</p>;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        Failed to load knockout fixtures. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-[var(--bg-elev)] px-4 py-2 text-sm text-[var(--muted)]">
        Knockout matchups are head-to-head. Everyone may keep predicting each
        round; each round&apos;s WC matches unlock once the bracket is drawn.
        If you predict a draw, you must also pick the penalty winner.
      </p>
      {FRIEND_ROUNDS.map((fr) => {
        const wcRounds = FRIEND_STAGE_WC_ROUNDS[fr.key];
        const fixtures = wcRounds.flatMap((r) => byRound[r] ?? []);
        return (
          <section key={fr.key} className="card p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="chip bg-[var(--accent-2)]/15 text-[var(--accent-2)]">{fr.title}</span>
              <span className="text-xs text-[var(--muted)]">{fr.blurb}</span>
            </div>
            {fixtures.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                🔒 Unlocks when the {wcRounds.join(" / ")} fixtures are published
                (after the group stage finishes).
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {wcRounds.map((round) => {
                  const byRound = fixtures.filter((m) => m.round === round);
                  if (byRound.length === 0) return null;
                  return (
                    <div key={round}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
                        {round} matchups
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {byRound.map((m) => {
                          const p = matches[m.id];
                          return (
                            <MatchPredictionCard
                              key={m.id}
                              match={m}
                              home={p ? p.home : null}
                              away={p ? p.away : null}
                              locked={isLocked(m)}
                              saveState={saveStates[m.id]}
                              isKnockout
                              predictedWinner={p?.predictedWinner}
                              onChange={(h, a, winner) => onMatchChange(m.id, h, a, winner)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
