"use client";

import { useEffect, useState } from "react";
import { fetchInsights } from "@/lib/wcClient";
import type { MatchInsights } from "@/app/api/wc/match/[id]/insights/route";

const COMP_LABELS: Record<string, string> = {
  form: "Form",
  att: "Attack",
  def: "Defense",
  poisson_distribution: "Poisson",
  h2h: "Head-to-head",
  goals: "Goals",
  total: "Overall",
};

export function InsightsPanel({ fixtureId }: { fixtureId: number }) {
  const [data, setData] = useState<MatchInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchInsights(fixtureId)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [fixtureId]);

  if (error)
    return <p className="text-xs text-red-300">Couldn&apos;t load insights: {error}</p>;
  if (!data) return <p className="text-xs text-[var(--muted)]">Loading insights…</p>;

  if (!data.available) {
    return (
      <p className="text-xs text-[var(--muted)]">
        API-Football has no detailed prediction for this match yet (it populates
        closer to kickoff). Win probability defaults to even.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-xs">
      {data.advice && (
        <div className="rounded-md bg-[var(--bg-elev)] px-3 py-2">
          <span className="text-[var(--muted)]">Advice: </span>
          <span className="font-medium">{data.advice}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Prob label={data.teams.home ?? "Home"} value={data.percent.home} />
        <Prob label="Draw" value={data.percent.draw} muted />
        <Prob label={data.teams.away ?? "Away"} value={data.percent.away} />
      </div>
      {data.winner.name && (
        <p className="text-[var(--muted)]">
          Model favors <b className="text-[var(--fg)]">{data.winner.name}</b>
          {data.winner.comment ? ` (${data.winner.comment})` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {Object.entries(data.comparison).map(([k, v]) => (
          <div key={k} className="rounded-md border border-[var(--border)] px-2 py-1">
            <div className="text-[10px] uppercase text-[var(--muted)]">
              {COMP_LABELS[k] ?? k}
            </div>
            <div className="flex justify-between font-medium">
              <span>{v.home}</span>
              <span className="text-[var(--muted)]">vs</span>
              <span>{v.away}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Prob({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-md px-2 py-1.5 text-center ${
        muted ? "bg-[var(--bg-elev)]" : "bg-[var(--accent-2)]/10"
      }`}
    >
      <div className="text-sm font-bold">{value}</div>
      <div className="truncate text-[10px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
