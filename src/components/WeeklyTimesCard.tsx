"use client";

import { useState } from "react";
import type { WeeklyTimes, WeeklyGroup, WeeklyStatLine } from "@/lib/feedTypes";
import { PunditDesk } from "./PunditDesk";

function Movement({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  if (prevRank == null) return <span className="text-[10px] font-bold text-[var(--muted)]">NEW</span>;
  if (rank < prevRank) return <span className="text-xs font-bold text-[var(--green)]" title={`Up ${prevRank - rank}`}>▲{prevRank - rank}</span>;
  if (rank > prevRank) return <span className="text-xs font-bold text-[var(--accent)]" title={`Down ${rank - prevRank}`}>▼{rank - prevRank}</span>;
  return <span className="text-xs text-[var(--muted)]">—</span>;
}

function GroupTable({ g }: { g: WeeklyGroup }) {
  const sorted = [...g.teams].sort((a, b) => a.rank - b.rank);
  return (
    <div className="break-inside-avoid">
      <div className="border-b border-[var(--fg)]/40 pb-0.5 text-xs font-bold uppercase tracking-wide">{g.group}</div>
      <table className="w-full text-[11px]">
        <tbody>
          {sorted.map((t, i) => (
            <tr key={t.team} className={`border-b border-[var(--border)] ${i < 2 ? "font-semibold" : ""}`}>
              <td className="py-0.5 pr-1 text-[var(--muted)] tabular-nums">{t.rank}</td>
              <td className="flex items-center gap-1 py-0.5">
                {t.logo && <img src={t.logo} alt="" className="h-3.5 w-3.5 object-contain" />}
                <span className="truncate">{t.team}</span>
              </td>
              <td className="py-0.5 text-right tabular-nums">{t.points}</td>
              <td className="w-8 py-0.5 text-right"><Movement rank={t.rank} prevRank={t.prevRank} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatList({ title, lines, suffix }: { title: string; lines: WeeklyStatLine[]; suffix: string }) {
  if (!lines.length) return null;
  return (
    <div>
      <div className="mb-1 border-b border-[var(--fg)]/40 pb-0.5 text-xs font-bold uppercase tracking-wide">{title}</div>
      <ol className="space-y-0.5">
        {lines.map((l, i) => (
          <li key={l.teamName} className="flex items-center gap-1.5 text-[12px]">
            <span className="w-4 text-[var(--muted)] tabular-nums">{i + 1}.</span>
            {l.logoUrl && <img src={l.logoUrl} alt="" className="h-4 w-4 rounded-full object-cover" />}
            <span className="flex-1 truncate">{l.teamName}</span>
            <span className="font-bold tabular-nums">{l.value}{suffix}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function WeeklyTimesCard({ times, defaultExpanded = false }: { times: WeeklyTimes; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  const dateStr = new Date(times.weekEnd + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="card overflow-hidden bg-[var(--bg-card)] font-serif">
      {/* Masthead — click to toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block w-full border-b-2 border-double border-[var(--fg)] px-4 py-3 text-center"
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">The Global Football Cup Times</div>
        <div className="my-1 text-lg font-black leading-tight">{times.headline}</div>
        {times.subhead && <div className="text-xs italic text-[var(--muted)]">{times.subhead}</div>}
        <div className="mt-1 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          <span>{dateStr}</span>
          <span>·</span>
          <span className="text-[var(--accent)]">{open ? "Close" : "Read full edition ▾"}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 px-4 py-4">
          {/* Lead story */}
          {times.body.map((p, i) => (
            <p key={i} className={`text-sm leading-relaxed ${i === 0 ? "first-letter:float-left first-letter:mr-1 first-letter:text-4xl first-letter:font-black first-letter:leading-[0.8]" : ""}`}>
              {p}
            </p>
          ))}

          {/* Top points / perfects */}
          <div className="grid grid-cols-2 gap-4">
            <StatList title="Most Points This Week" lines={times.topPoints} suffix=" pts" />
            <StatList title="Most Perfect Games" lines={times.topPerfects.filter((p) => p.value > 0)} suffix="" />
          </div>

          {/* Close races */}
          {times.closeRaces.length > 0 && (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-elev)] p-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide">Too Close to Call</div>
              <ul className="list-disc space-y-0.5 pl-4 text-[12px]">
                {times.closeRaces.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {/* Group standings with movement */}
          {times.groups.length > 0 && (
            <div>
              <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">— Group Standings —</div>
              <div className="columns-2 gap-4 sm:columns-3 [&>*]:mb-3">
                {times.groups.map((g) => <GroupTable key={g.group} g={g} />)}
              </div>
              <p className="mt-1 text-center text-[10px] text-[var(--muted)]">▲/▼ = position change since last week</p>
            </div>
          )}

          {/* Pundit column */}
          {times.punditColumn.length > 0 && (
            <div>
              <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">— From the Desk —</div>
              <PunditDesk lines={times.punditColumn} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
