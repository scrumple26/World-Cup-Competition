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

interface KnockoutPredictionsProps {
  matches: Record<number, MatchPrediction>;
  lockedMatches: Set<number>;
  saveStates: Record<number, SaveState>;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null, predictedWinner?: Outcome) => void;
  onLockGame: (fixtureId: number) => void;
  onLockAll: () => void;
  isUserLocked: boolean;
  locking: boolean;
  lockError: string | null;
  pendingCount: number;
}

export function KnockoutPredictions({
  matches,
  lockedMatches,
  saveStates,
  onMatchChange,
  onLockGame,
  onLockAll,
  isUserLocked,
  locking,
  lockError,
  pendingCount,
}: KnockoutPredictionsProps) {
  const [byRound, setByRound] = useState<Record<string, WcMatch[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
              <div className="mt-2 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {fixtures.map((m) => {
                    const p = matches[m.id];
                    const locked = isLocked(m) || isUserLocked || lockedMatches.has(m.id);
                    return (
                      <div key={m.id} className="space-y-1">
                        <MatchPredictionCard
                          match={m}
                          home={p ? p.home : null}
                          away={p ? p.away : null}
                          locked={locked}
                          saveState={saveStates[m.id]}
                          isKnockout
                          predictedWinner={p?.predictedWinner}
                          onChange={(h, a, winner) => onMatchChange(m.id, h, a, winner)}
                        />
                        {!isUserLocked && !isLocked(m) && matches[m.id] && !lockedMatches.has(m.id) && (
                          <button
                            onClick={() => onLockGame(m.id)}
                            className="w-full rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-2 py-1.5 text-xs font-medium text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/20 transition"
                          >
                            🔒 Lock this match
                          </button>
                        )}
                        {lockedMatches.has(m.id) && (
                          <div className="text-center text-xs text-[var(--accent)] font-medium">
                            ✓ Match locked
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* Lock all games section — only shown to real users before locked */}
      {!isUserLocked && pendingCount > 0 && (
        <div className="card p-5 space-y-3">
          {confirming ? (
            <div className="space-y-4">
              <div>
                <div className="font-semibold">Ready to lock all knockout picks?</div>
                <div className="text-sm text-[var(--muted)]">
                  You have {pendingCount} knockout prediction{pendingCount !== 1 ? "s" : ""} ready to lock in.
                  Once locked, you won&apos;t be able to change them.
                </div>
              </div>
              {lockError && <p className="text-sm text-red-400">{lockError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={onLockAll}
                  disabled={locking}
                  className="btn-primary flex-1"
                >
                  {locking ? "Locking…" : "✓ Confirm & lock all"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="btn-ghost flex-1"
                >
                  ← Go back and edit
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Ready to lock all picks?</div>
                  <div className="text-sm text-[var(--muted)]">
                    Your picks auto-save as you enter them. Lock all games at once when you&apos;re ready.
                  </div>
                </div>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={pendingCount === 0}
                  className="btn-primary px-6"
                >
                  🔒 Lock All Knockout Picks
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
