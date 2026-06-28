"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useWcData } from "@/lib/useWcData";
import { usePredictions } from "@/lib/usePredictions";
import { useKnockoutPredictions } from "@/lib/useKnockoutPredictions";
import { GroupSection } from "./GroupSection";
import { ThirdPlaceSelector } from "./ThirdPlaceSelector";
import { FlashcardMode } from "./FlashcardMode";
import { KnockoutPredictions } from "./KnockoutPredictions";
import type { MatchPrediction, WcMatch } from "@/lib/types";
import { PICK_DEADLINE_ISO } from "@/lib/config";

const CT = "America/Chicago";

function formatDeadline(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function CountdownBanner({ deadline }: { deadline: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (secondsLeft === 0) return;
    const t = setInterval(() => {
      setSecondsLeft(() => {
        const next = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
        if (next === 0) clearInterval(t);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, secondsLeft === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (secondsLeft === 0) return null;

  const days    = Math.floor(secondsLeft / 86400);
  const hours   = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const urgent  = secondsLeft < 3600; // < 1 hour

  return (
    <div className={`rounded-xl border px-4 py-3 ${urgent ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
      <div className={`mb-2 text-[10px] font-semibold uppercase tracking-widest ${urgent ? "text-red-400" : "text-amber-400"}`}>
        ⏰ Predictions lock in
      </div>
      <div className="flex items-end gap-3">
        {(days > 0 ? [
          { v: days,    l: "days" },
          { v: hours,   l: "hrs"  },
          { v: minutes, l: "min"  },
          { v: seconds, l: "sec"  },
        ] : [
          { v: hours,   l: "hrs"  },
          { v: minutes, l: "min"  },
          { v: seconds, l: "sec"  },
        ]).map(({ v, l }) => (
          <div key={l} className="flex flex-col items-center">
            <span className={`text-2xl font-bold tabular-nums leading-none ${urgent ? "text-red-300" : "text-[var(--fg)]"}`}>
              {pad(v)}
            </span>
            <span className="mt-0.5 text-[10px] text-[var(--muted)]">{l}</span>
          </div>
        ))}
        <span className="mb-0.5 text-xs text-[var(--muted)]">· {formatDeadline(deadline)} CT</span>
      </div>
    </div>
  );
}

// Compute group standings from predicted scores (mirrors GroupSection logic)
function computeGroupStandings(
  teams: { id: number }[],
  groupMatches: WcMatch[],
  predictions: Record<number, MatchPrediction>,
) {
  const stats = new Map(teams.map(t => [t.id, { id: t.id, pts: 0, gd: 0, gf: 0 }]));
  for (const m of groupMatches) {
    const pred = predictions[m.id];
    if (!pred || pred.home === null || pred.away === null) continue;
    const h = stats.get(m.homeTeamId);
    const a = stats.get(m.awayTeamId);
    if (!h || !a) continue;
    const hg = Number(pred.home), ag = Number(pred.away);
    h.gf += hg; h.gd += hg - ag;
    a.gf += ag; a.gd += ag - hg;
    if (hg > ag)      { h.pts += 3; }
    else if (hg < ag) { a.pts += 3; }
    else              { h.pts += 1; a.pts += 1; }
  }
  return [...stats.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

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

  // Deadline = the single soft/hard pick deadline (EOD Sunday). You can lock in
  // any time up to here; games that kicked off before your lock-in score 0.
  const deadline = PICK_DEADLINE_ISO;

  const {
    loaded,
    matches,
    groupOrders,
    groupOverridden,
    thirdPlace,
    thirdPlaceOverridden,
    saveStates,
    setMatch,
    setOrder,
    toggleThird,
    setThirdPlaceAuto,
    overrideThirdPlace,
    resetThirdPlaceOverride,
    lockIn,
    isUserLocked,
    isLocked,
    locking,
    lockError,
    pendingCount,
  } = usePredictions(targetUid, groups, deadline, !actAs);

  // Knockout predictions hook
  const {
    loaded: koLoaded,
    matches: koMatches,
    lockedMatches,
    saveStates: koSaveStates,
    setMatch: setKoMatch,
    lockGame,
    lockAllGames,
    isUserLocked: koIsUserLocked,
    locking: koLocking,
    lockError: koLockError,
    pendingCount: koPendingCount,
  } = useKnockoutPredictions(targetUid, !actAs);

  // Compute the best 8 third-place teams from predicted match scores
  const autoThirdPlace = useMemo(() => {
    if (!groups.length || !loaded) return [];
    const thirds = groups.map(g => {
      const standings = computeGroupStandings(g.teams, g.matches, matches);
      const third = standings[2];
      return third ? { ...third, groupLetter: g.letter } : null;
    }).filter(Boolean) as Array<{ id: number; pts: number; gd: number; gf: number; groupLetter: string }>;

    return thirds
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
      .slice(0, 8)
      .map(t => t.id);
  }, [groups, matches, loaded]);

  // Auto-update third-place selection when scores change (if not manually overridden)
  useEffect(() => {
    if (autoThirdPlace.length > 0) setThirdPlaceAuto(autoThirdPlace);
  }, [autoThirdPlace, setThirdPlaceAuto]);

  const [mode, setMode] = useState<Mode>("group");
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof sessionStorage !== "undefined") {
      const saved = sessionStorage.getItem("pred-stage");
      if (saved === "knockout") return "knockout";
    }
    return "group";
  });
  const [confirming, setConfirming] = useState(false);

  function changeStage(s: Stage) {
    setStage(s);
    try { sessionStorage.setItem("pred-stage", s); } catch { /* non-fatal */ }
  }

  if (loading || !loaded || !koLoaded) {
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
    await lockIn();
    if (!lockError) setConfirming(false);
  }

  return (
    <div className="space-y-5">
      {actAs && (
        <div className="rounded-lg bg-[var(--gold)]/10 px-4 py-2 text-sm text-[var(--gold)]">
          Admin: editing predictions for <b>{actAs.teamName}</b>.
        </div>
      )}

      {/* Locked banner */}
      {isLocked && !isAdmin && (
        <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm">
          <span className="font-semibold text-[var(--accent)]">🔒 Predictions are locked.</span>
          <span className="ml-2 text-[var(--muted)]">
            {isUserLocked
              ? "Your picks are submitted."
              : "The deadline has passed — picks that were never locked in were not submitted and score 0."}
          </span>
        </div>
      )}

      {/* Countdown */}
      {!isLocked && deadline && <CountdownBanner deadline={deadline} />}

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
            onClick={() => changeStage(s)}
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
          matches={koMatches}
          lockedMatches={lockedMatches}
          saveStates={koSaveStates}
          onMatchChange={setKoMatch}
          onLockGame={lockGame}
          onLockAll={lockAllGames}
          isUserLocked={koIsUserLocked}
          locking={koLocking}
          lockError={koLockError}
          pendingCount={koPendingCount}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Group Stage Predictions</h1>
              <p className="text-sm text-[var(--muted)]">
                {Object.keys(matches).length}/{totalMatches} entered
                {pendingCount > 0 && !isLocked && <span className="ml-1 text-amber-400">· not locked in yet</span>}
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
                  userLocked={isLocked}
                />
              ))}
              <ThirdPlaceSelector
                groups={groups}
                groupOrders={groupOrders}
                selected={thirdPlace}
                overridden={thirdPlaceOverridden}
                disabled={isLocked}
                onToggle={toggleThird}
                onOverride={overrideThirdPlace}
                onReset={() => resetThirdPlaceOverride(autoThirdPlace)}
              />
            </div>
          )}

          {/* Lock In section — only shown to real users before the deadline */}
          {!isAdmin && !isLocked && (
            <div className="card p-5 space-y-3">
              {confirming ? (
                <div className="space-y-4">
                  <div>
                    <div className="font-semibold">Review your picks</div>
                    {(() => {
                      const unfilled = groups.reduce((acc, g) => acc + g.matches.filter(m => !matches[m.id]).length, 0);
                      return (
                        <div className="text-sm text-[var(--muted)]">
                          {Object.keys(matches).length} predictions entered
                          {unfilled > 0 && <span className="ml-1 text-amber-400">· {unfilled} unfilled</span>}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                    {groups.map((g) => (
                      <div key={g.group}>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)]">
                          Group {g.letter}
                        </div>
                        <div className="space-y-0.5">
                          {g.matches.map((m) => {
                            const pred = matches[m.id];
                            return (
                              <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md bg-[var(--bg-elev)] px-2.5 py-1.5 text-xs">
                                <div className="flex items-center justify-end gap-1.5 min-w-0">
                                  {m.homeLogo && <img src={m.homeLogo} alt="" className="h-4 w-6 rounded-sm object-contain flex-shrink-0" />}
                                  <span className="truncate text-right">{m.homeTeamName}</span>
                                </div>
                                <span className={`w-14 text-center font-mono font-bold tabular-nums ${pred ? "" : "text-amber-400"}`}>
                                  {pred ? `${pred.home}–${pred.away}` : "—"}
                                </span>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate">{m.awayTeamName}</span>
                                  {m.awayLogo && <img src={m.awayLogo} alt="" className="h-4 w-6 rounded-sm object-contain flex-shrink-0" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {lockError && <p className="text-sm text-red-400">{lockError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleLockIn}
                      disabled={locking}
                      className="btn-primary flex-1"
                    >
                      {locking ? "Locking in…" : "✓ Confirm & lock in"}
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
                      <div className="font-semibold">Ready to finalise?</div>
                      <div className="text-sm text-[var(--muted)]">
                        Your picks auto-save as you enter them — you can leave and come back any time.
                        Lock in when you&apos;re happy with everything.
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
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
