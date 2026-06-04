import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { FRIEND_GROUPS } from "@/lib/wc";

export const dynamic = "force-dynamic";

/** POST /api/admin/group { uid, group } — reassign a participant's friend-group. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { uid, group } = (await req.json()) as { uid: string; group: string };
  if (!uid || !FRIEND_GROUPS.includes(group as (typeof FRIEND_GROUPS)[number])) {
    return NextResponse.json({ error: "valid uid + group required" }, { status: 400 });
  }
  await db.collection("users").doc(uid).set({ friendGroup: group }, { merge: true });
  return NextResponse.json({ ok: true });
}
