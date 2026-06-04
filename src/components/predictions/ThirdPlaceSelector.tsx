"use client";

import type { GroupBundle } from "@/lib/wcClient";
import { THIRD_PLACE_ADVANCING } from "@/lib/wc";
import { TeamBadge } from "../TeamBadge";

/**
 * Pick which 8 of the 12 predicted third-place teams advance to the Round of 32.
 * Candidates are each group's 3rd-place team from the user's predicted order.
 */
export function ThirdPlaceSelector({
  groups,
  groupOrders,
  selected,
  disabled,
  onToggle,
}: {
  groups: GroupBundle[];
  groupOrders: Record<string, number[]>;
  selected: number[];
  disabled?: boolean;
  onToggle: (teamId: number, max: number) => void;
}) {
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
        <h3 className="font-semibold">Best 3rd-place teams</h3>
        <span
          className={`chip ${remaining === 0 ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--border)] text-[var(--muted)]"}`}
        >
          {selected.length}/{THIRD_PLACE_ADVANCING} picked
        </span>
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        8 of the 12 third-place teams advance. Pick the 8 you think make it
        (candidates update as you reorder each group).
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {candidates.map(({ group, team }) => {
          const isSel = selected.includes(team.id);
          const full = !isSel && remaining === 0;
          return (
            <button
              key={team.id}
              disabled={disabled || full}
              onClick={() => onToggle(team.id, THIRD_PLACE_ADVANCING)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                isSel
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] bg-[var(--bg-elev)] hover:border-[var(--accent-2)]"
              } ${full ? "opacity-40" : ""}`}
            >
              <span className="w-5 text-xs text-[var(--muted)]">{group}</span>
              <span className="flex-1 truncate">
                <TeamBadge name={team.name} logo={team.logo} size={18} />
              </span>
              <span className={isSel ? "text-[var(--accent)]" : "text-[var(--border)]"}>
                {isSel ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
