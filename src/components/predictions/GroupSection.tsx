"use client";

import { useEffect, useMemo } from "react";
import type { GroupBundle } from "@/lib/wcClient";
import type { WcMatch } from "@/lib/types";
import { isLocked } from "@/lib/wcMap";
import { MatchPredictionCard, type SaveState } from "./MatchPredictionCard";
import type { MatchPrediction } from "@/lib/types";

// ---- Standings computation ----

interface TeamStats {
  id: number;
  name: string;
  logo: string;
  played: number;
  pts: number;
  gd: number;
  gf: number;
}

function computeStandings(
  teams: { id: number; name: string; logo: string }[],
  groupMatches: WcMatch[],
  predictions: Record<number, MatchPrediction>,
): TeamStats[] {
  const stats = new Map<number, TeamStats>(
    teams.map(t => [t.id, { id: t.id, name: t.name, logo: t.logo, played: 0, pts: 0, gd: 0, gf: 0 }]),
  );

  for (const m of groupMatches) {
    const pred = predictions[m.id];
    if (!pred || pred.home === null || pred.away === null) continue;

    const h = stats.get(m.homeTeamId);
    const a = stats.get(m.awayTeamId);
    if (!h || !a) continue;

    const hg = Number(pred.home);
    const ag = Number(pred.away);

    h.played++; a.played++;
    h.gf += hg; h.gd += hg - ag;
    a.gf += ag; a.gd += ag - hg;

    if (hg > ag)       { h.pts += 3; }
    else if (hg < ag)  { a.pts += 3; }
    else               { h.pts += 1; a.pts += 1; }
  }

  return [...stats.values()].sort(
    (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf,
  );
}

// ---- Component ----

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
  // Compute standings from the user's own match score predictions
  const standings = useMemo(
    () => computeStandings(bundle.teams, bundle.matches, matches),
    [bundle.teams, bundle.matches, matches],
  );

  const computedOrder = useMemo(() => standings.map(r => r.id), [standings]);

  // Auto-save the computed order to Firestore whenever it changes
  useEffect(() => {
    if (computedOrder.length === 0) return;
    const isDifferent = JSON.stringify(computedOrder) !== JSON.stringify(order);
    if (isDifferent) onReorder(computedOrder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(computedOrder)]);

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

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
        {/* Computed group standings */}
        <div>
          <div className="label">Predicted finish</div>
          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elev)] text-[var(--muted)]">
                  <th className="w-5 px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Team</th>
                  <th className="w-7 px-1 py-1.5 text-center" title="Played">P</th>
                  <th className="w-7 px-1 py-1.5 text-center" title="Points">Pts</th>
                  <th className="w-9 px-1 py-1.5 text-center" title="Goal difference">GD</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-t border-[var(--border)] ${
                      i < 2 ? "bg-[var(--accent)]/5" : i === 2 ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5">
                      <span className={`font-bold ${i < 2 ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        {t.logo && (
                          <img src={t.logo} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-contain flex-shrink-0" />
                        )}
                        <span className="truncate font-medium">{t.name}</span>
                      </span>
                    </td>
                    <td className="px-1 py-1.5 text-center text-[var(--muted)]">{t.played}</td>
                    <td className="px-1 py-1.5 text-center font-bold">{t.pts}</td>
                    <td className="px-1 py-1.5 text-center text-[var(--muted)]">
                      {t.gd > 0 ? `+${t.gd}` : t.gd}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[var(--border)] px-3 py-1 flex gap-3 text-[9px] text-[var(--muted)]">
              <span><span className="inline-block h-1.5 w-1.5 rounded-sm bg-[var(--accent)]/40 mr-1" />Qualifies</span>
              <span><span className="inline-block h-1.5 w-1.5 rounded-sm bg-amber-500/40 mr-1" />May advance</span>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Updates automatically as you enter match scores
          </p>
        </div>

        {/* Match score inputs */}
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
