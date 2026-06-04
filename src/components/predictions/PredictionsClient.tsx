"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWcData } from "@/lib/useWcData";
import { usePredictions } from "@/lib/usePredictions";
import { GroupSection } from "./GroupSection";
import { ThirdPlaceSelector } from "./ThirdPlaceSelector";
import { FlashcardMode } from "./FlashcardMode";

type Mode = "group" | "flash";

export function PredictionsClient() {
  const { user } = useAuth();
  const { data, loading, error } = useWcData();
  const groups = data?.groups ?? [];
  const {
    loaded,
    matches,
    groupOrders,
    thirdPlace,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
  } = usePredictions(user?.uid, groups);

  const [mode, setMode] = useState<Mode>("group");

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
                  ? "bg-[var(--accent)] text-[#06210f]"
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
    </div>
  );
}
