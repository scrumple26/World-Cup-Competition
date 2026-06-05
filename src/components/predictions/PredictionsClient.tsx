"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWcData } from "@/lib/useWcData";
import { usePredictions } from "@/lib/usePredictions";
import { GroupSection } from "./GroupSection";
import { ThirdPlaceSelector } from "./ThirdPlaceSelector";
import { FlashcardMode } from "./FlashcardMode";
import { KnockoutPredictions } from "./KnockoutPredictions";

type Mode = "group" | "flash";
type Stage = "group" | "knockout";

export function PredictionsClient({
  actAs,
}: {
  actAs?: { uid: string; teamName: string };
}) {
  const { user } = useAuth();
  const { data, loading, error } = useWcData();
  const groups = data?.groups ?? [];
  const targetUid = actAs?.uid ?? user?.uid;
  const {
    loaded,
    matches,
    groupOrders,
    groupOverridden,
    thirdPlace,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
    lockIn,
    isUserLocked,
    locking,
  } = usePredictions(targetUid, groups);

  const [mode, setMode] = useState<Mode>("group");
  const [stage, setStage] = useState<Stage>("group");
  const [confirming, setConfirming] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  if (loading || !loaded) {
    return <p className="text-[var(--muted)]">Loading World Cup fixtures…</p>;
  }
  if (error) {
    return (
      <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
        Couldn&apos;t load fixtures: {error}
      </p>
    );
  }

  const totalMatches = data?.fixtures.length ?? 0;
  const isAdmin = !!actAs;

  async function handleLockIn() {
    setLockError(null);
    try {
      await lockIn();
      setConfirming(false);
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Lock-in failed — try again.");
    }
  }

  return (
    <div className="space-y-5">
      {actAs && (
        <div className="rounded-lg bg-[var(--gold)]/10 px-4 py-2 text-sm text-[var(--gold)]">
          Admin: editing predictions for <b>{actAs.teamName}</b>.
        </div>
      )}

      {/* Locked banner */}
      {isUserLocked && !isAdmin && (
        <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm">
          <span className="font-semibold text-[var(--accent)]">🔒 Predictions locked in.</span>
          <span className="ml-2 text-[var(--muted)]">
            Your picks are submitted. Scores lock individually at each kickoff.
          </span>
        </div>
      )}

      {/* Stage tabs */}
      <div className="flex rounded-lg border border-[var(--border)] p-1 sm:w-fit">
        {(
          [
            ["group", "Group stage"],
            ["knockout", "Knockout"],
          ] as const
        ).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`flex-1 rounded-md px-4 py-1.5 text-sm font-semibold transition sm:flex-none ${
              stage === s ? "bg-[var(--accent-2)] text-white" : "text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {stage === "knockout" ? (
        <KnockoutPredictions
          matches={matches}
          saveStates={saveStates}
          onMatchChange={setMatch}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Group Stage Predictions</h1>
              <p className="text-sm text-[var(--muted)]">
                {Object.keys(matches).length}/{totalMatches} entered · auto-saved
              </p>
            </div>
            <div className="flex rounded-lg border border-[var(--border)] p-1">
              {(
                [
                  ["group", "By group"],
                  ["flash", "Flashcards"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    mode === m ? "bg-[var(--accent)] text-white" : "text-[var(--muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "flash" ? (
            <FlashcardMode
              groups={groups}
              matches={matches}
              saveStates={saveStates}
              onMatchChange={setMatch}
            />
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <GroupSection
                  key={g.group}
                  bundle={g}
                  order={groupOrders[g.group] ?? g.teams.map((t) => t.id)}
                  overridden={!!groupOverridden[g.group]}
                  matches={matches}
                  saveStates={saveStates}
                  onReorder={(order, isManual) => setOrder(g.group, order, isManual)}
                  onMatchChange={setMatch}
                  userLocked={isUserLocked}
                />
              ))}
              <ThirdPlaceSelector
                groups={groups}
                groupOrders={groupOrders}
                selected={thirdPlace}
                onToggle={toggleThird}
              />
            </div>
          )}

          {/* Lock In section — only shown to real users, not admin acting-as */}
          {!isAdmin && (
            <div className="card p-5 space-y-3">
              {isUserLocked ? (
                <div className="text-center">
                  <div className="text-2xl mb-1">🔒</div>
                  <div className="font-semibold">Your predictions are locked in</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Individual match picks still lock automatically at kickoff.
                  </div>
                </div>
              ) : confirming ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">
                    Lock in {Object.keys(matches).length} prediction{Object.keys(matches).length !== 1 ? "s" : ""}?
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Once locked, you won&apos;t be able to change your picks. Make sure you&apos;re happy with all your scores, group finishes, and third-place selections.
                  </p>
                  {lockError && <p className="text-sm text-red-400">{lockError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleLockIn}
                      disabled={locking}
                      className="btn-primary flex-1"
                    >
                      {locking ? "Locking in…" : "Yes, lock in my predictions"}
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="btn-ghost flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Ready to finalise?</div>
                    <div className="text-sm text-[var(--muted)]">
                      Your picks auto-save as you enter them — you can leave and come back any time.
                      When you&apos;re happy with everything, lock in to prevent further changes.
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={Object.keys(matches).length === 0}
                    className="btn-primary px-6"
                  >
                    🔒 Lock In Predictions
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
