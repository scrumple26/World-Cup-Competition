import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/remove-user  { uid }
 * Removes a user from both Firebase Auth and all Firestore documents.
 * Admin-only.
 */
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const { uid } = (await req.json().catch(() => ({}))) as { uid?: string };
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  // Delete Firebase Auth user
  await auth.deleteUser(uid).catch(() => { /* already deleted */ });

  // Delete Firestore profile
  await db.collection("users").doc(uid).delete().catch(() => {});

  // Delete score doc
  await db.collection("scores").doc(uid).delete().catch(() => {});

  // Delete predictions sub-collections (best-effort)
  const predRef = db.collection("predictions").doc(uid);
  const [mSnap, gSnap, tSnap] = await Promise.all([
    predRef.collection("matches").get().catch(() => null),
    predRef.collection("groups").get().catch(() => null),
    predRef.collection("meta").get().catch(() => null),
  ]);
  const deleteBatch = db.batch();
  for (const snap of [mSnap, gSnap, tSnap]) {
    snap?.docs.forEach((d) => deleteBatch.delete(d.ref));
  }
  deleteBatch.delete(predRef);
  await deleteBatch.commit().catch(() => {});

  return NextResponse.json({ ok: true, uid });
}
