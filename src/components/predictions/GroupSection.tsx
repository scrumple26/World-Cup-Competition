"use client";

import type { GroupBundle } from "@/lib/wcClient";
import { isLocked } from "@/lib/wcMap";
import { GroupFinishOrder } from "./GroupFinishOrder";
import { MatchPredictionCard, type SaveState } from "./MatchPredictionCard";
import type { MatchPrediction } from "@/lib/types";

export function GroupSection({
  bundle,
  order,
  matches,
  saveStates,
  onReorder,
  onMatchChange,
  userLocked = false,
}: {
  bundle: GroupBundle;
  order: number[];
  matches: Record<number, MatchPrediction>;
  saveStates: Record<number, SaveState>;
  onReorder: (order: number[]) => void;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null) => void;
  userLocked?: boolean;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="chip bg-[var(--accent-2)]/15 text-[var(--accent-2)]">
          {bundle.group}
        </span>
        <span className="text-xs text-[var(--muted)]">
          {bundle.matches.length} matches
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_2fr]">
        <div>
          <div className="label">Predicted finish (drag to reorder)</div>
          <GroupFinishOrder
            teams={bundle.teams}
            order={order}
            onReorder={onReorder}
          />
        </div>

        <div>
          <div className="label">Match scores</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {bundle.matches.map((m) => {
              const pred = matches[m.id];
              return (
                <MatchPredictionCard
                  key={m.id}
                  match={m}
                  home={pred ? pred.home : null}
                  away={pred ? pred.away : null}
                  locked={isLocked(m) || userLocked}
                  saveState={saveStates[m.id]}
                  onChange={(h, a) => onMatchChange(m.id, h, a)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
