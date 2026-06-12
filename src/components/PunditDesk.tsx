"use client";

import { useState } from "react";
import type { PunditLine, PunditSpeaker } from "@/lib/feedTypes";

const PUNDITS: Record<PunditSpeaker, { name: string; img: string; short: string }> = {
  dempsey: { name: "Clint Dempsey", img: "/pundits/dempsey.png", short: "Dempsey" },
  howard:  { name: "Tim Howard",   img: "/pundits/howard.png",  short: "Howard" },
  donovan: { name: "Landon Donovan", img: "/pundits/donovan.png", short: "Donovan" },
};

/** Circular pundit headshot; falls back to initials if the image is missing. */
function Avatar({ speaker, size }: { speaker: PunditSpeaker; size: number }) {
  const [broken, setBroken] = useState(false);
  const p = PUNDITS[speaker];
  const initials = p.short.slice(0, 2).toUpperCase();
  if (broken) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--accent-2)] font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        title={p.name}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.img}
      alt={p.name}
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover ring-2 ring-[var(--border)]"
      style={{ width: size, height: size }}
    />
  );
}

export interface PunditMatch {
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number;
  awayScore: number;
}

export function PunditDesk({ lines, match }: { lines: PunditLine[]; match?: PunditMatch }) {
  if (!lines || lines.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3">
      {/* Optional score strip with country flags */}
      {match && (
        <div className="mb-3 flex items-center justify-center gap-3 rounded-lg bg-[var(--bg-card)] px-3 py-2">
          <div className="flex flex-1 items-center justify-end gap-2 truncate">
            <span className="truncate text-sm font-semibold">{match.homeTeam}</span>
            {match.homeLogo && <img src={match.homeLogo} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />}
          </div>
          <span className="font-mono text-xl font-black tabular-nums">{match.homeScore} – {match.awayScore}</span>
          <div className="flex flex-1 items-center gap-2 truncate">
            {match.awayLogo && <img src={match.awayLogo} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />}
            <span className="truncate text-sm font-semibold">{match.awayTeam}</span>
          </div>
        </div>
      )}

      {/* Desk header — big headshots */}
      <div className="mb-3 flex items-center gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex -space-x-3">
          {(Object.keys(PUNDITS) as PunditSpeaker[]).map((s) => (
            <Avatar key={s} speaker={s} size={64} />
          ))}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
            Postgame Pundit Recap
          </div>
          <div className="truncate text-base font-bold leading-tight">
            {match ? `${match.homeTeam} vs ${match.awayTeam}` : "The Pundit Desk"}
          </div>
          <div className="text-[11px] text-[var(--muted)]">Dempsey · Howard · Donovan break it down</div>
        </div>
      </div>

      {/* Dialogue */}
      <div className="space-y-3">
        {lines.map((l, i) => {
          const p = PUNDITS[l.speaker];
          return (
            <div key={i} className="flex items-start gap-3">
              <Avatar speaker={l.speaker} size={56} />
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[var(--bg-card)] px-3 py-2">
                <div className="text-xs font-bold text-[var(--accent)]">{p.short}</div>
                <p className="text-sm leading-snug text-[var(--fg)]">{l.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
