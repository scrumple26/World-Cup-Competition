"use client";

import Link from "next/link";
import type { RankedRow } from "@/lib/league";

function pct(num: number | undefined, den: number | undefined): string {
  if (!den || den === 0) return "—";
  return `${Math.round(((num ?? 0) / den) * 100)}%`;
}

export function StandingsTable({
  rows,
  highlightUid,
  showGroup = false,
  showQualify = false,
}: {
  rows: RankedRow[];
  highlightUid?: string;
  showGroup?: boolean;
  showQualify?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--bg-elev)] text-left text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2 w-10">#</th>
            <th className="px-3 py-2">Team</th>
            {showGroup && <th className="px-3 py-2 w-16">Grp</th>}
            <th className="px-3 py-2 w-14 text-right">Pts</th>
            <th className="hidden sm:table-cell px-3 py-2 w-18 text-right" title="Correct H/D/A outcome">Result%</th>
            <th className="hidden sm:table-cell px-3 py-2 w-18 text-right" title="At least one exact score">Score%</th>
            <th className="hidden sm:table-cell px-3 py-2 w-18 text-right" title="Both scores exactly right">Perfect%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const me = r.user.uid === highlightUid;
            const resultPct  = pct(r.score.outcomesCorrect, r.score.outcomesTotal);
            const scorePct   = pct(r.score.partialScoreCorrect, r.score.outcomesTotal);
            const perfectPct = pct(r.score.perfectScores, r.score.outcomesTotal);
            return (
              <tr
                key={r.user.uid}
                className={`border-t border-[var(--border)] ${me ? "bg-[var(--accent)]/10" : ""}`}
              >
                <td className="px-3 py-2 font-semibold text-[var(--muted)]">
                  {r.rank}
                  {showQualify && r.qualified && (
                    <span className="ml-1 text-[var(--accent)]" title="Qualifies">●</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/team/${r.user.uid}`} className="flex items-center gap-2 font-medium hover:underline">
                    {r.user.logoUrl ? (
                      <img src={r.user.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--bg-elev)] text-[10px] font-bold text-[var(--muted)]">
                        {r.user.teamName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    {r.user.teamName}
                  </Link>
                </td>
                {showGroup && (
                  <td className="px-3 py-2 text-[var(--muted)]">{r.user.friendGroup}</td>
                )}
                <td className="px-3 py-2 text-right font-bold">{r.score.total}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-right text-[var(--muted)]">{resultPct}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-right text-[var(--muted)]">{scorePct}</td>
                <td className="hidden sm:table-cell px-3 py-2 text-right text-[var(--muted)]">{perfectPct}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
