"use client";

import { useMemo } from "react";
import { useWcData } from "@/lib/useWcData";
import type { WcGroupStanding } from "@/lib/wcMap";

export function WorldCupClient() {
  const { data: wc, loading } = useWcData();

  const standings = useMemo(() => wc?.standings ?? [], [wc]);

  if (loading || !wc) {
    return <p className="text-[var(--muted)]">Loading standings…</p>;
  }

  if (standings.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">World Cup 2026 Standings</h1>
        <p className="text-[var(--muted)]">
          No standings data yet. Use Admin → Sync now to pull live data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">World Cup 2026 Standings</h1>
        <span className="text-xs text-[var(--muted)]">Via API-Football · updates every 3 hrs</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {standings.map((g) => (
          <GroupTable key={g.group} group={g} />
        ))}
      </div>
    </div>
  );
}

function GroupTable({ group: g }: { group: WcGroupStanding }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-[var(--bg-elev)] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-2)]">
        {g.group}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--muted)]">
            <th className="w-6 px-2 py-1.5 text-left">#</th>
            <th className="px-2 py-1.5 text-left">Team</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Played">P</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Won">W</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Drawn">D</th>
            <th className="w-7 px-1 py-1.5 text-center" title="Lost">L</th>
            <th className="w-9 px-1 py-1.5 text-center" title="Goal difference">GD</th>
            <th className="w-8 px-2 py-1.5 text-right font-bold" title="Points">Pts</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r, i) => {
            const qualifies = i < 2;   // top 2 advance automatically
            const mayAdvance = i === 2; // 3rd place might advance
            return (
              <tr
                key={r.teamId}
                className={`border-t border-[var(--border)] ${
                  qualifies
                    ? "bg-[var(--accent)]/5"
                    : mayAdvance
                      ? "bg-amber-500/5"
                      : ""
                }`}
              >
                <td className="px-2 py-2 text-[var(--muted)]">{r.rank}</td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-1.5">
                    {r.logo && (
                      <img src={r.logo} alt="" width={16} height={16} className="h-4 w-4 rounded-sm object-contain flex-shrink-0" />
                    )}
                    <span className="truncate font-medium">{r.teamName}</span>
                  </span>
                </td>
                <td className="px-1 py-2 text-center text-[var(--muted)]">{r.played}</td>
                <td className="px-1 py-2 text-center">{r.win}</td>
                <td className="px-1 py-2 text-center text-[var(--muted)]">{r.draw}</td>
                <td className="px-1 py-2 text-center text-[var(--muted)]">{r.lose}</td>
                <td className="px-1 py-2 text-center text-[var(--muted)]">
                  {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
                </td>
                <td className="px-2 py-2 text-right font-bold">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-[var(--border)] px-3 py-1.5 flex gap-3 text-[10px] text-[var(--muted)]">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-[var(--accent)]/30 mr-1" />Qualifies</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-500/30 mr-1" />May advance (best 3rd)</span>
      </div>
    </div>
  );
}
