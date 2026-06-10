"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWcData } from "@/lib/useWcData";
import type { WcMatch } from "@/lib/types";

const LIVE = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);
const DONE = new Set(["FT", "AET", "PEN"]);
const POLL_MS = 60_000;

function minuteLabel(m: WcMatch): string {
  if (m.status === "HT") return "HT";
  if (m.status === "P") return "PENS";
  if (m.elapsed != null) return `${m.elapsed}'`;
  return "LIVE";
}

/** Dashboard "Live now" strip. Scores/stats only render when spoilers are off
 *  (hideScores=false); otherwise it just notes that matches are in progress. */
export function LiveNow({ spoilerMode }: { spoilerMode?: boolean }) {
  const { data: wc } = useWcData();
  const [live, setLive] = useState<WcMatch[]>([]);

  // Fixtures that could be in play right now (kickoff within the last ~3h, not finished).
  const candidateIds = (wc?.fixtures ?? [])
    .filter((m) => {
      const k = new Date(m.kickoff).getTime();
      return k <= Date.now() && Date.now() - k < 3 * 3600_000 && !DONE.has(m.status);
    })
    .map((m) => m.id);

  useEffect(() => {
    if (candidateIds.length === 0) { setLive([]); return; }
    let active = true;
    const ids = candidateIds.join(",");
    async function poll() {
      try {
        const res = await fetch(`/api/wc/live?ids=${ids}`);
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: WcMatch[] };
        if (active) setLive((data.matches ?? []).filter((m) => LIVE.has(m.status)));
      } catch { /* silent */ }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { active = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIds.join(",")]);

  if (live.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        Live Now
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {live.map((m) => (
          <Link
            key={m.id}
            href="/worldcup"
            className="card flex items-center gap-2 p-3 transition hover:border-[var(--accent-2)]"
          >
            <div className="flex flex-1 items-center justify-end gap-1.5 truncate">
              <span className="truncate text-sm font-semibold">{m.homeTeamName}</span>
              {m.homeLogo && <img src={m.homeLogo} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />}
            </div>
            <div className="flex flex-col items-center px-1">
              {spoilerMode ? (
                <span className="text-xs font-bold text-green-500">LIVE</span>
              ) : (
                <span className="font-mono text-sm font-bold tabular-nums">
                  {m.goals.home ?? 0} – {m.goals.away ?? 0}
                </span>
              )}
              <span className="text-[10px] text-green-500">{minuteLabel(m)}</span>
            </div>
            <div className="flex flex-1 items-center gap-1.5 truncate">
              {m.awayLogo && <img src={m.awayLogo} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />}
              <span className="truncate text-sm font-semibold">{m.awayTeamName}</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--muted)]">
        {spoilerMode
          ? "Scores hidden (spoiler protection). Tap a match for the full schedule."
          : "Tap a match for live stats on the World Cup page."}
      </p>
    </div>
  );
}
