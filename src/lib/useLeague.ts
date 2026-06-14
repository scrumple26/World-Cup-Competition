"use client";

import { useEffect, useState } from "react";
import { loadLeague, type LeagueData } from "./scoresRepo";

// Re-fetch standings in the background so finished games and live score
// changes appear without a manual refresh. The /api/league read is cached
// ~30s server-side, so polling a bit faster than that is cheap.
const POLL_MS = 60_000;

export function useLeague() {
  const [data, setData] = useState<LeagueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const refresh = () =>
      loadLeague()
        .then((d) => {
          if (active) {
            setData(d);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });

    refresh();
    const t = setInterval(refresh, POLL_MS);

    // Refresh immediately when the tab regains focus/visibility.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { data, loading };
}
