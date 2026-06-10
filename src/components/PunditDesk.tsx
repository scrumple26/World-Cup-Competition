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

export function PunditDesk({ lines }: { lines: PunditLine[] }) {
  if (!lines || lines.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3">
      {/* Desk header — sizeable headshots */}
      <div className="mb-3 flex items-center gap-3 border-b border-[var(--border)] pb-3">
        <div className="flex -space-x-2">
          {(Object.keys(PUNDITS) as PunditSpeaker[]).map((s) => (
            <Avatar key={s} speaker={s} size={40} />
          ))}
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">The Pundit Desk</div>
          <div className="text-[11px] text-[var(--muted)]">Dempsey · Howard · Donovan break it down</div>
        </div>
      </div>

      {/* Dialogue */}
      <div className="space-y-2.5">
        {lines.map((l, i) => {
          const p = PUNDITS[l.speaker];
          return (
            <div key={i} className="flex items-start gap-2.5">
              <Avatar speaker={l.speaker} size={32} />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[var(--accent)]">{p.short}</div>
                <p className="text-sm leading-snug text-[var(--fg)]">{l.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
