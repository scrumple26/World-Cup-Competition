import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { backupUserPicks } from "@/lib/pickBackup";

export const dynamic = "force-dynamic";

/**
 * POST /api/backup-picks   (Authorization: Bearer <Firebase ID token>)
 * Snapshots the caller's own picks into pickBackups/{uid}. Called right after a
 * player locks in. Non-critical: failures should never block lock-in.
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const ok = await backupUserPicks(db, uid);
    return NextResponse.json({ ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
