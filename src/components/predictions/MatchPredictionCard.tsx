"use client";

import { useState } from "react";
import type { WcMatch } from "@/lib/types";
import { TeamBadge } from "../TeamBadge";
import { InsightsPanel } from "./InsightsPanel";

export type SaveState = "idle" | "saving" | "saved";

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
  return (
    <input
      type="number"
      min={0}
      max={30}
      inputMode="numeric"
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Math.max(0, Math.min(30, Number(v))));
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
  onChange,
}: {
  match: WcMatch;
  home: number | null;
  away: number | null;
  locked: boolean;
  saveState?: SaveState;
  onChange: (home: number | null, away: number | null) => void;
}) {
  const [showInsights, setShowInsights] = useState(false);
  const kickoff = new Date(match.kickoff);
  const played =
    match.goals.home !== null && match.goals.away !== null;

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>
          {kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
          {kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="flex items-center gap-2">
          {locked && <span className="chip bg-[var(--border)] text-[var(--muted)]">🔒 Locked</span>}
          {saveState === "saving" && <span>Saving…</span>}
          {saveState === "saved" && <span className="text-[var(--accent)]">✓ Saved</span>}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 truncate text-right">
          <TeamBadge name={match.homeTeamName} logo={match.homeLogo} reverse />
        </div>
        <div className="flex items-center gap-1.5">
          <ScoreInput
            value={home}
            onChange={(v) => onChange(v, away)}
            disabled={locked}
            ariaLabel={`${match.homeTeamName} score`}
          />
          <span className="text-[var(--muted)]">–</span>
          <ScoreInput
            value={away}
            onChange={(v) => onChange(home, v)}
            disabled={locked}
            ariaLabel={`${match.awayTeamName} score`}
          />
        </div>
        <div className="flex-1 truncate">
          <TeamBadge name={match.awayTeamName} logo={match.awayLogo} />
        </div>
      </div>

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
