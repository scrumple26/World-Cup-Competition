"use client";

import { useState } from "react";
import type { GroupBundle } from "@/lib/wcClient";
import { THIRD_PLACE_ADVANCING } from "@/lib/wc";
import { TeamBadge } from "../TeamBadge";

export function ThirdPlaceSelector({
  groups,
  groupOrders,
  selected,
  overridden = false,
  disabled,
  onToggle,
  onOverride,
  onReset,
}: {
  groups: GroupBundle[];
  groupOrders: Record<string, number[]>;
  selected: number[];
  overridden?: boolean;
  disabled?: boolean;
  onToggle: (teamId: number, max: number) => void;
  onOverride?: () => void;
  onReset?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const candidates = groups
    .map((g) => {
      const thirdId = groupOrders[g.group]?.[2];
      const team = g.teams.find((t) => t.id === thirdId);
      return team ? { group: g.letter, team } : null;
    })
    .filter(Boolean) as { group: string; team: GroupBundle["teams"][number] }[];

  const remaining = THIRD_PLACE_ADVANCING - selected.length;

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Best 3rd-place teams</h3>
          {!overridden && (
            <p className="text-[10px] text-[var(--muted)] mt-0.5">Auto-selected from your predicted scores</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${remaining === 0 ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--border)] text-[var(--muted)]"}`}>
            {selected.length}/{THIRD_PLACE_ADVANCING} picked
          </span>
          {!disabled && (
            overridden ? (
              <button
                type="button"
                onClick={() => { setConfirming(false); onReset?.(); }}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--fg)] underline"
              >
                Reset to calculated
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[10px] text-[var(--accent-2)] hover:underline"
              >
                Override
              </button>
            )
          )}
        </div>
      </div>

      {confirming && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2">
          <p className="font-semibold text-amber-300">Override auto-selected teams?</p>
          <p className="text-[var(--muted)]">
            The 8 teams are currently selected based on your predicted match scores.
            Overriding lets you pick manually — you can reset to calculated any time.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setConfirming(false); onOverride?.(); }}
              className="btn-primary px-3 py-1 text-xs"
            >
              Yes, let me pick manually
            </button>
            <button onClick={() => setConfirming(false)} className="btn-ghost px-3 py-1 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="mb-3 text-xs text-[var(--muted)]">
        {overridden
          ? "8 of the 12 third-place teams advance to the Round of 32."
          : "Calculated from your scores — the top 8 third-place teams by points → GD → GF."}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {candidates.map(({ group, team }) => {
          const isSel = selected.includes(team.id);
          const full  = !isSel && remaining === 0;
          const isReadOnly = !overridden && !disabled;
          return (
            <button
              key={team.id}
              disabled={disabled || full || (isReadOnly && !confirming)}
              onClick={() => {
                if (isReadOnly) { setConfirming(true); return; }
                onToggle(team.id, THIRD_PLACE_ADVANCING);
              }}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                isSel
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg-elev)] hover:border-[var(--accent-2)]"
              } ${full || (isReadOnly && !confirming) ? "opacity-60 cursor-default" : ""}`}
            >
              <span className="w-5 text-xs text-[var(--muted)]">{group}</span>
              <span className="flex-1 truncate">
                <TeamBadge name={team.name} logo={team.logo} size={18} />
              </span>
              <span className={isSel ? "text-[var(--accent)]" : "text-[var(--border)]"}>
                {isSel ? "✓" : overridden ? "+" : "·"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
