"use client";

import { useMemo, useState } from "react";
import type { GroupBundle } from "@/lib/wcClient";
import type { MatchPrediction, WcMatch } from "@/lib/types";
import { isLocked } from "@/lib/wcMap";
import { MatchPredictionCard, type SaveState } from "./MatchPredictionCard";

type Step =
  | { kind: "intro"; group: string; count: number }
  | { kind: "match"; group: string; match: WcMatch };

export function FlashcardMode({
  groups,
  matches,
  saveStates,
  onMatchChange,
}: {
  groups: GroupBundle[];
  matches: Record<number, MatchPrediction>;
  saveStates: Record<number, SaveState>;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null) => void;
}) {
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [];
    for (const g of groups) {
      out.push({ kind: "intro", group: g.group, count: g.matches.length });
      for (const m of g.matches) out.push({ kind: "match", group: g.group, match: m });
    }
    return out;
  }, [groups]);

  const [i, setI] = useState(0);
  if (steps.length === 0) return null;

  const step = steps[Math.min(i, steps.length - 1)];
  const done = i >= steps.length;
  const matchSteps = steps.filter((s) => s.kind === "match").length;
  const matchesSoFar = steps.slice(0, i + 1).filter((s) => s.kind === "match").length;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full bg-[var(--accent)] transition-all"
          style={{ width: `${Math.min(100, (i / steps.length) * 100)}%` }}
        />
      </div>

      {done ? (
        <div className="card p-8 text-center">
          <div className="text-4xl">🎉</div>
          <h3 className="mt-2 text-lg font-bold">All matchups reviewed!</h3>
          <p className="text-sm text-[var(--muted)]">
            Your picks save automatically. Switch to “By group” to set finishing
            order and third-place picks.
          </p>
          <button className="btn-ghost mt-4" onClick={() => setI(0)}>
            Start over
          </button>
        </div>
      ) : step.kind === "intro" ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Now predicting
          </div>
          <div className="my-2 text-5xl font-black text-[var(--accent-2)]">
            {step.group}
          </div>
          <div className="text-sm text-[var(--muted)]">{step.count} matches</div>
          <button className="btn-primary mt-6 w-40" onClick={() => setI((n) => n + 1)}>
            Start →
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 text-center text-xs text-[var(--muted)]">
            {step.group} · matchup {matchesSoFar}/{matchSteps}
          </div>
          <MatchPredictionCard
            match={step.match}
            home={matches[step.match.id]?.home ?? null}
            away={matches[step.match.id]?.away ?? null}
            locked={isLocked(step.match)}
            saveState={saveStates[step.match.id]}
            onChange={(h, a) => onMatchChange(step.match.id, h, a)}
          />
        </div>
      )}

      {!done && (
        <div className="mt-4 flex justify-between">
          <button
            className="btn-ghost"
            disabled={i === 0}
            onClick={() => setI((n) => Math.max(0, n - 1))}
          >
            ← Back
          </button>
          <button className="btn-primary" onClick={() => setI((n) => n + 1)}>
            {step.kind === "intro" ? "Skip" : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}
