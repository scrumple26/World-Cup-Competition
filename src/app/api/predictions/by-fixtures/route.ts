import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { MatchPrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

type PredsByUid = Record<string, Record<number, { home: number; away: number; predictedWinner?: string }>>;

// Predictions are immutable once a match has kicked off, so cache per fixture-set.
let cache: { key: string; data: { preds: PredsByUid }; expires: number } | null = null;
const TTL_MS = 60_000;

/**
 * GET /api/predictions/by-fixtures?ids=1,2,3
 * Returns every player's predicted scoreline for the given fixtures, fetched via
 * direct doc reads (no index) and cached ~60s. Powers the live, provisional
 * Global Football Cup standings without re-reading anyone's full pick set.
 */
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) return NextResponse.json({ preds: {} });
  const ids = idsParam.split(",").map(Number).filter((n) => n > 0).slice(0, 30);
  if (ids.length === 0) return NextResponse.json({ preds: {} });

  const key = [...ids].sort((a, b) => a - b).join(",");
  if (cache && cache.key === key && cache.expires > Date.now()) {
    return NextResponse.json(cache.data);
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ preds: {} });

  const usersSnap = await db.collection("users").get();
  const uids = usersSnap.docs.map((d) => d.id);
  const refs = [];
  for (const uid of uids) {
    for (const id of ids) {
      refs.push(db.collection("predictions").doc(uid).collection("matches").doc(String(id)));
    }
  }

  const preds: PredsByUid = {};
  if (refs.length) {
    const docs = await db.getAll(...refs);
    docs.forEach((snap, i) => {
      if (!snap.exists) return;
      const uid = uids[Math.floor(i / ids.length)];
      const fid = ids[i % ids.length];
      const p = snap.data() as MatchPrediction;
      (preds[uid] ??= {})[fid] = { home: p.home, away: p.away, predictedWinner: p.predictedWinner };
    });
  }

  const data = { preds };
  cache = { key, data, expires: Date.now() + TTL_MS };
  return NextResponse.json(data);
}
