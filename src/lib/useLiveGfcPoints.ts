"use client";

import { useEffect, useRef, useState } from "react";
import { useWcData } from "./useWcData";
import { scoreMatch } from "./scoring";
import type { WcMatch } from "./types";

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "P", "BT", "SUSP", "INT"]);

type PredsByUid = Record<string, Record<number, { home: number; away: number }>>;

/**
 * Provisional Global Football Cup points from in-progress matches: each player's
 * pick scored against the LIVE scoreline, so standings can move as goals go in.
 *
 * Efficient: each player's picks for the live fixtures are fetched once (cached
 * server + client); only the live scores are polled (API-Football, no Firestore).
 * Limited to group-stage matches, where scoring needs no penalty/ET overrides.
 */
export function useLiveGfcPoints(): { deltaByUid: Record<string, number>; liveActive: boolean } {
  const { data: wc } = useWcData();
  const [deltaByUid, setDeltaByUid] = useState<Record<string, number>>({});
  const [liveActive, setLiveActive] = useState(false);
  const predsRef = useRef<{ key: string; preds: PredsByUid } | null>(null);

  useEffect(() => {
    if (!wc) return;
    const candidates = wc.fixtures
      .filter((m) => m.round.startsWith("Group Stage"))
      .filter((m) => {
        const k = new Date(m.kickoff).getTime();
        return k <= Date.now() && Date.now() - k < 3 * 3600_000 && !["FT", "AET", "PEN"].includes(m.status);
      })
      .map((m) => m.id);

    if (candidates.length === 0) { setDeltaByUid({}); setLiveActive(false); return; }

    let active = true;
    const idsStr = candidates.join(",");

    async function loadPreds(): Promise<PredsByUid> {
      if (predsRef.current?.key === idsStr) return predsRef.current.preds;
      try {
        const res = await fetch(`/api/predictions/by-fixtures?ids=${idsStr}`);
        const d = (await res.json()) as { preds?: PredsByUid };
        predsRef.current = { key: idsStr, preds: d.preds ?? {} };
        return predsRef.current.preds;
      } catch {
        return {};
      }
    }

    async function poll() {
      try {
        const [liveJson, preds] = await Promise.all([
          fetch(`/api/wc/live?ids=${idsStr}`).then((r) => r.json() as Promise<{ matches?: WcMatch[] }>),
          loadPreds(),
        ]);
        const live = (liveJson.matches ?? []).filter(
          (m) => LIVE_STATUSES.has(m.status) && m.goals.home != null && m.goals.away != null,
        );
        if (!active) return;
        if (live.length === 0) { setDeltaByUid({}); setLiveActive(false); return; }

        const delta: Record<string, number> = {};
        for (const [uid, byFid] of Object.entries(preds)) {
          let sum = 0;
          for (const m of live) {
            const p = byFid[m.id];
            if (!p) continue;
            sum += scoreMatch({ home: p.home, away: p.away }, { home: m.goals.home as number, away: m.goals.away as number }).total;
          }
          if (sum > 0) delta[uid] = sum;
        }
        setDeltaByUid(delta);
        setLiveActive(true);
      } catch { /* silent */ }
    }

    poll();
    const t = setInterval(poll, 60_000);
    return () => { active = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wc]);

  return { deltaByUid, liveActive };
}
