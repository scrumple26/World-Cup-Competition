import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/pred-counts  { uids: string[] }   (admin token)
 * Returns each player's match-pick count + lock status WITHOUT reading their
 * full prediction set: uses Firestore aggregation count() (≈1 read each) plus a
 * single userLock doc read — ~2 reads/player instead of ~75.
 * → { counts: { [uid]: { matches: number; locked: boolean } } }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { uids } = (await req.json().catch(() => ({}))) as { uids?: string[] };
  if (!Array.isArray(uids)) return NextResponse.json({ error: "uids[] required" }, { status: 400 });

  const counts: Record<string, { matches: number; locked: boolean }> = {};
  await Promise.all(
    uids.slice(0, 200).map(async (uid) => {
      const predRef = db.collection("predictions").doc(uid);
      try {
        const [agg, lock] = await Promise.all([
          predRef.collection("matches").count().get(),
          predRef.collection("meta").doc("userLock").get(),
        ]);
        counts[uid] = { matches: agg.data().count, locked: lock.exists };
      } catch {
        counts[uid] = { matches: 0, locked: false };
      }
    }),
  );

  return NextResponse.json({ counts });
}
