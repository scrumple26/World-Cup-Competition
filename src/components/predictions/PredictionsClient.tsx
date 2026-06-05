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
    thirdPlace,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
  } = usePredictions(targetUid, groups);

  const [mode, setMode] = useState<Mode>("group");
  const [stage, setStage] = useState<Stage>("group");

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
  const predicted = Object.keys(matches).length;

  return (
    <div className="space-y-5">
      {actAs && (
        <div className="rounded-lg bg-[var(--gold)]/10 px-4 py-2 text-sm text-[var(--gold)]">
          Admin: editing predictions for <b>{actAs.teamName}</b>. Changes save to
          their account.
        </div>
      )}
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
            {predicted}/{totalMatches} match scores entered · auto-saved
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
                mode === m
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)]"
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
              matches={matches}
              saveStates={saveStates}
              onReorder={(order) => setOrder(g.group, order)}
              onMatchChange={setMatch}
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
        </>
      )}
    </div>
  );
}
