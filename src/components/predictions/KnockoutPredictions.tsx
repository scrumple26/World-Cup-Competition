"use client";

import { useEffect, useState } from "react";
import { fetchFixtures } from "@/lib/wcClient";
import { FRIEND_STAGE_WC_ROUNDS } from "@/lib/wc";
import { isLocked } from "@/lib/wcMap";
import type { MatchPrediction, WcMatch } from "@/lib/types";
import { MatchPredictionCard, type SaveState } from "./MatchPredictionCard";

const FRIEND_ROUNDS: { key: "ko1" | "ko2" | "kofinal"; title: string; blurb: string }[] = [
  { key: "ko1", title: "Knockout Round 1", blurb: "Predict every WC Round of 32 match." },
  { key: "ko2", title: "Your Semifinals", blurb: "Predict every WC Round of 16 match." },
  { key: "kofinal", title: "Your Final", blurb: "Predict the WC Quarter-finals, Semi-finals & Final." },
];

export function KnockoutPredictions({
  matches,
  saveStates,
  onMatchChange,
}: {
  matches: Record<number, MatchPrediction>;
  saveStates: Record<number, SaveState>;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null) => void;
}) {
  const [byRound, setByRound] = useState<Record<string, WcMatch[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wcRounds = Array.from(new Set(Object.values(FRIEND_STAGE_WC_ROUNDS).flat()));
    Promise.all(
      wcRounds.map((r) => fetchFixtures(r).then((m) => [r, m] as const).catch(() => [r, []] as const)),
    ).then((entries) => {
      setByRound(Object.fromEntries(entries));
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-[var(--muted)]">Loading knockout fixtures…</p>;

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-[var(--bg-elev)] px-4 py-2 text-sm text-[var(--muted)]">
        Knockout matchups are head-to-head. Everyone may keep predicting each
        round; each round&apos;s WC matches unlock once the bracket is drawn.
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
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {fixtures.map((m) => {
                  const p = matches[m.id];
                  return (
                    <MatchPredictionCard
                      key={m.id}
                      match={m}
                      home={p ? p.home : null}
                      away={p ? p.away : null}
                      locked={isLocked(m)}
                      saveState={saveStates[m.id]}
                      onChange={(h, a) => onMatchChange(m.id, h, a)}
                    />
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
