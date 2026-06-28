import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isGroupRound } from "@/lib/wc";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

async function loadKnockoutFixtureIds(db: FirebaseFirestore.Firestore): Promise<Set<number>> {
  const ids = new Set<number>();
  const wcSnap = await db.collection("wcMatches").get();
  for (const d of wcSnap.docs) {
    const m = d.data() as { id?: number; round?: string };
    if (typeof m.id === "number" && typeof m.round === "string" && !isGroupRound(m.round)) {
      ids.add(m.id);
    }
  }
  return ids;
}

async function unlockKnockoutForUid(
  db: FirebaseFirestore.Firestore,
  uid: string,
  knockoutIds: Set<number>,
) {
  const predRef = db.collection("predictions").doc(uid);

  try {
    await predRef.collection("meta").doc("knockoutUnlock").set({ unlockedAt: Date.now() }, { merge: true });
  } catch (error) {
    console.warn("[admin/unlock] failed to set knockoutUnlock doc", { uid, error });
  }

  let matchSnap: FirebaseFirestore.QuerySnapshot | null = null;
  try {
    matchSnap = await predRef.collection("matches").get();
  } catch (error) {
    console.warn("[admin/unlock] failed reading match docs", { uid, error });
  }

  let cleared = 0;
  if (matchSnap && !matchSnap.empty && knockoutIds.size > 0) {
    const BATCH_SIZE = 400;
    const docs = matchSnap.docs.filter((d) => knockoutIds.has(Number(d.id)));
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
 * Unlocks knockout picks only (group picks remain locked): marks
 * `meta/knockoutUnlock` and clears `userLocked` on knockout match docs.
 * Admin-only.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { uid, all } = (await req.json().catch(() => ({}))) as { uid?: string; all?: boolean };
  if (!uid && !all) return NextResponse.json({ error: "uid or all=true required" }, { status: 400 });

  let knockoutIds: Set<number>;
  try {
    knockoutIds = await loadKnockoutFixtureIds(db);
  } catch (error) {
    console.error("[admin/unlock] failed loading knockout fixtures", { error });
    return NextResponse.json({ error: "Failed to load knockout fixtures" }, { status: 500 });
  }

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
      cleared += await unlockKnockoutForUid(db, doc.id, knockoutIds);
    }
    return NextResponse.json({ ok: true, all: true, users: predDocs.length, cleared, scope: "knockout" });
  }

  const cleared = await unlockKnockoutForUid(db, uid as string, knockoutIds);

  return NextResponse.json({ ok: true, uid, cleared, scope: "knockout" });
}
