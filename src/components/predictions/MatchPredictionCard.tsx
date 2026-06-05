"use client";

import { useEffect, useState } from "react";
import type { Outcome, WcMatch } from "@/lib/types";
import { TeamBadge } from "../TeamBadge";
import { InsightsPanel } from "./InsightsPanel";

export type SaveState = "idle" | "saving" | "saved";

const CT = "America/Chicago";

function ctTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function useCountdown(kickoffIso: string, locked: boolean): string | null {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (locked) { setText(null); return; }

    function calc() {
      const diffMs = new Date(kickoffIso).getTime() - Date.now();
      if (diffMs <= 0) return null;
      if (diffMs > 24 * 3600_000) return null; // more than 24h — no urgency
      const totalMin = Math.floor(diffMs / 60_000);
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      if (hrs > 0) return `Locks in ${hrs}h ${mins}m`;
      if (totalMin >= 5) return `Locks in ${totalMin}m`;
      if (totalMin >= 1) return `⚡ Locks in ${totalMin}m`;
      return `⚡ Locking soon!`;
    }

    setText(calc());
    const id = setInterval(() => setText(calc()), 30_000);
    return () => clearInterval(id);
  }, [kickoffIso, locked]);

  return text;
}

function ScoreInput({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  // Use type="text" + inputMode="numeric" to avoid iOS Safari number-input quirks
  // while still showing the numeric keyboard on mobile.
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value === null ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        if (raw === "") { onChange(null); return; }
        const n = Math.min(30, parseInt(raw, 10));
        onChange(isNaN(n) ? null : n);
      }}
      className="h-11 w-12 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] text-center text-lg font-bold outline-none focus:border-[var(--accent-2)] disabled:opacity-60"
    />
  );
}

export function MatchPredictionCard({
  match,
  home,
  away,
  locked,
  saveState = "idle",
  predictedWinner,
  isKnockout = false,
  onChange,
}: {
  match: WcMatch;
  home: number | null;
  away: number | null;
  locked: boolean;
  saveState?: SaveState;
  predictedWinner?: Outcome;
  isKnockout?: boolean;
  onChange: (home: number | null, away: number | null, predictedWinner?: Outcome) => void;
}) {
  const [showInsights, setShowInsights] = useState(false);
  const countdown = useCountdown(match.kickoff, locked);

  const played = match.goals.home !== null && match.goals.away !== null;
  const isTie = home !== null && away !== null && home === away;
  const showWinnerPick = isKnockout && isTie && !locked;

  return (
    <div className="card p-3">
      {/* Header: kickoff time + countdown + status */}
      <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>{ctTime(match.kickoff)}</span>
        <span className="flex items-center gap-2">
          {countdown && (
            <span className={`font-medium ${countdown.startsWith("⚡") ? "text-red-400" : "text-amber-400"}`}>
              {countdown}
            </span>
          )}
          {locked && <span className="chip bg-[var(--border)] text-[var(--muted)]">🔒 Locked</span>}
          {saveState === "saving" && <span>Saving…</span>}
          {saveState === "saved" && <span className="text-[var(--accent)]">✓ Saved</span>}
        </span>
      </div>

      {/* Score inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate text-right">
          <TeamBadge name={match.homeTeamName} logo={match.homeLogo} reverse />
        </div>
        <div className="flex items-center gap-1.5">
          <ScoreInput
            value={home}
            onChange={(v) => onChange(v, away, predictedWinner)}
            disabled={locked}
            ariaLabel={`${match.homeTeamName} score`}
          />
          <span className="text-[var(--muted)]">–</span>
          <ScoreInput
            value={away}
            onChange={(v) => onChange(home, v, predictedWinner)}
            disabled={locked}
            ariaLabel={`${match.awayTeamName} score`}
          />
        </div>
        <div className="flex-1 truncate">
          <TeamBadge name={match.awayTeamName} logo={match.awayLogo} />
        </div>
      </div>

      {/* Knockout winner picker (shown when scores are tied) */}
      {showWinnerPick && (
        <div className="mt-2.5 border-t border-[var(--border)] pt-2.5">
          <p className="mb-1.5 text-[11px] text-[var(--muted)]">
            Draw — who wins on penalties?{" "}
            {!predictedWinner && <span className="text-amber-400 font-medium">Required</span>}
          </p>
          <div className="flex gap-2">
            {(["home", "away"] as const).map((side) => {
              const name = side === "home" ? match.homeTeamName : match.awayTeamName;
              const active = predictedWinner === side;
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => onChange(home, away, side)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent-2)] hover:text-[var(--fg)]"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer: result + insights */}
      <div className="mt-2 flex items-center justify-between">
        {played ? (
          <span className="text-[11px] text-[var(--gold)]">
            Result: {match.goals.home}–{match.goals.away}
          </span>
        ) : (
          <span />
        )}
        <button
          onClick={() => setShowInsights((s) => !s)}
          className="text-[11px] text-[var(--accent-2)] hover:underline"
        >
          {showInsights ? "Hide insights" : "Insights & stats"}
        </button>
      </div>

      {showInsights && (
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          <InsightsPanel fixtureId={match.id} />
        </div>
      )}
    </div>
  );
}
