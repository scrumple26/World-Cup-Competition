"use client";

import { useEffect, useState } from "react";
import type { WcMatch } from "./types";
import type { WcGroupStanding } from "./wcMap";
import {
  buildGroupBundles,
  fetchFixtures,
  fetchStandings,
  type GroupBundle,
} from "./wcClient";

export interface WcData {
  fixtures: WcMatch[];
  standings: WcGroupStanding[];
  groups: GroupBundle[];
}

// Module-level cache shared across components (one fetch per session).
let cache: WcData | null = null;
let inflight: Promise<WcData> | null = null;

async function load(): Promise<WcData> {
  if (cache) return cache;
  if (!inflight) {
    inflight = Promise.all([fetchFixtures(), fetchStandings()]).then(
      ([fixtures, standings]) => {
        cache = {
          fixtures,
          standings,
          groups: buildGroupBundles(standings, fixtures),
        };
        return cache;
      },
    );
  }
  return inflight;
}

/** Load WC fixtures + standings (cached). Returns {data, loading, error}. */
export function useWcData() {
  const [data, setData] = useState<WcData | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache) {
      setData(cache);
      setLoading(false);
      return;
    }
    let active = true;
    load()
      .then((d) => active && (setData(d), setLoading(false)))
      .catch((e) => active && (setError(e.message), setLoading(false)));
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
