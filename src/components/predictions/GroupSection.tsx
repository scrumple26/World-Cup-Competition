"use client";

import { useEffect, useMemo, useState } from "react";
import type { GroupBundle } from "@/lib/wcClient";
import type { WcMatch } from "@/lib/types";
import { isLocked } from "@/lib/wcMap";
import { GroupFinishOrder } from "./GroupFinishOrder";
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
  return [...stats.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

// ---- Component ----

export function GroupSection({
  bundle,
  order,
  overridden = false,
  matches,
  saveStates,
  onReorder,
  onMatchChange,
  userLocked = false,
}: {
  bundle: GroupBundle;
  order: number[];
  overridden?: boolean;
  matches: Record<number, MatchPrediction>;
  saveStates: Record<number, SaveState>;
  onReorder: (order: number[], isManual: boolean) => void;
  onMatchChange: (fixtureId: number, home: number | null, away: number | null) => void;
  userLocked?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  // Computed order from match scores
  const standings = useMemo(
    () => computeStandings(bundle.teams, bundle.matches, matches),
    [bundle.teams, bundle.matches, matches],
  );
  const computedOrder = useMemo(() => standings.map(r => r.id), [standings]);

  // When NOT manually overridden, auto-save the computed order whenever it changes
  useEffect(() => {
    if (overridden) return;
    if (computedOrder.length === 0) return;
    const isDifferent = JSON.stringify(computedOrder) !== JSON.stringify(order);
    if (isDifferent) onReorder(computedOrder, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(computedOrder), overridden]);

  function confirmOverride() {
    setConfirming(false);
    onReorder(order.length ? order : computedOrder, true);
  }

  function resetToComputed() {
    onReorder(computedOrder, false);
  }

  // The order shown in the manual drag UI
  const manualOrder = order.length ? order : computedOrder;

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

        {/* ---- Left: group finish order ---- */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="label m-0">Predicted finish</div>
            {!userLocked && (
              overridden ? (
                <button
                  type="button"
                  onClick={resetToComputed}
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
                  Override order
                </button>
              )
            )}
          </div>

          {/* Confirmation prompt */}
          {confirming && (
            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2">
              <p className="font-semibold text-amber-300">Override calculated order?</p>
              <p className="text-[var(--muted)]">
                The order is currently calculated from your match scores.
                Once you set it manually it won&apos;t update automatically,
                but you can reset it any time.
              </p>
              <div className="flex gap-2">
                <button onClick={confirmOverride} className="btn-primary px-3 py-1 text-xs">
                  Yes, let me set it
                </button>
                <button onClick={() => setConfirming(false)} className="btn-ghost px-3 py-1 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Computed view (read-only table) */}
          {!overridden && (
            <>
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
                      <tr key={t.id} className={`border-t border-[var(--border)] ${i < 2 ? "bg-[var(--accent)]/5" : i === 2 ? "bg-amber-500/5" : ""}`}>
                        <td className="px-2 py-1.5">
                          <span className={`font-bold ${i < 2 ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{i + 1}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="flex items-center gap-1.5">
                            {t.logo && <img src={t.logo} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-contain flex-shrink-0" />}
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
              <p className="mt-1 text-[10px] text-[var(--muted)]">Auto-calculated from your match scores</p>
            </>
          )}

          {/* Manual drag/arrow view */}
          {overridden && (
            <>
              <GroupFinishOrder
                teams={bundle.teams}
                order={manualOrder}
                disabled={userLocked}
                onReorder={(newOrder) => onReorder(newOrder, true)}
              />
              <p className="mt-1 text-[10px] text-amber-400/80">Manually set · drag or use arrows to reorder</p>
            </>
          )}
        </div>

        {/* ---- Right: match score inputs ---- */}
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
