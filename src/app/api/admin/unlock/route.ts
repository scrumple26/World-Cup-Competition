import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/unlock  { uid }
 * Re-opens a player's predictions for editing (the inverse of /api/lock-in):
 * deletes their `meta/userLock` doc and clears the `userLocked` flag on each
 * saved match. Their existing picks are left untouched — they simply become
 * editable again, so a player who locked in early/incomplete can finish.
 * Admin-only. Note: once the first match kicks off, the global deadline locks
 * everyone regardless, so this is only useful before kickoff.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { uid } = (await req.json().catch(() => ({}))) as { uid?: string };
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const predRef = db.collection("predictions").doc(uid);

  // Remove the authoritative lock signal the prediction screen reads.
  await predRef.collection("meta").doc("userLock").delete().catch(() => {});

  // Clear the per-match userLocked flag so nothing treats the picks as submitted.
  const matchSnap = await predRef.collection("matches").get().catch(() => null);
  let cleared = 0;
  if (matchSnap && !matchSnap.empty) {
    const BATCH_SIZE = 400;
    const docs = matchSnap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + BATCH_SIZE)) {
        batch.set(d.ref, { userLocked: false }, { merge: true });
        cleared++;
      }
      await batch.commit();
    }
  }

  return NextResponse.json({ ok: true, uid, cleared });
}
