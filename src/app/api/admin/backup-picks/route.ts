import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { backupUserPicks } from "@/lib/pickBackup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/backup-picks  (admin only)
 * Backfill: snapshots picks for every player who has already locked in but
 * doesn't yet have a backup. Idempotent — existing backups are left untouched.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  try {
    const usersSnap = await db.collection("users").get();
    let backed = 0;
    let skipped = 0;
    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const [lockSnap, existing] = await Promise.all([
        db.collection("predictions").doc(uid).collection("meta").doc("userLock").get(),
        db.collection("pickBackups").doc(uid).get(),
      ]);
      // Only players who have actually locked in, and not already backed up.
      if (!lockSnap.exists || existing.exists) { skipped++; continue; }
      const ok = await backupUserPicks(db, uid);
      if (ok) backed++; else skipped++;
    }
    return NextResponse.json({ ok: true, backed, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
