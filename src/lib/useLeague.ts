"use client";

import { useEffect, useState } from "react";
import { loadLeague, type LeagueData } from "./scoresRepo";

export function useLeague() {
  const [data, setData] = useState<LeagueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadLeague().then((d) => {
      if (active) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}
