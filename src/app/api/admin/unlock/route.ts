import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

async function unlockUid(db: FirebaseFirestore.Firestore, uid: string) {
  const predRef = db.collection("predictions").doc(uid);

  try {
    await predRef.collection("meta").doc("userLock").delete();
  } catch (error) {
    console.warn("[admin/unlock] failed to delete userLock doc", { uid, error });
  }

  let matchSnap: FirebaseFirestore.QuerySnapshot | null = null;
  try {
    matchSnap = await predRef.collection("matches").get();
  } catch (error) {
    console.warn("[admin/unlock] failed reading match docs", { uid, error });
  }
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

  return cleared;
}

/**
 * POST /api/admin/unlock  { uid } or { all: true }
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

  const { uid, all } = (await req.json().catch(() => ({}))) as { uid?: string; all?: boolean };
  if (!uid && !all) return NextResponse.json({ error: "uid or all=true required" }, { status: 400 });

  if (all) {
    let predDocs: FirebaseFirestore.DocumentReference[] = [];
    try {
      predDocs = await db.collection("predictions").listDocuments();
    } catch (error) {
      console.error("[admin/unlock] failed listing prediction docs", { error });
      return NextResponse.json({ error: "Failed to list users for unlock" }, { status: 500 });
    }
    let cleared = 0;
    for (const doc of predDocs) {
      cleared += await unlockUid(db, doc.id);
    }
    return NextResponse.json({ ok: true, all: true, users: predDocs.length, cleared });
  }

  const cleared = await unlockUid(db, uid as string);

  return NextResponse.json({ ok: true, uid, cleared });
}
