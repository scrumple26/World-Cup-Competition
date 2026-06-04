import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const COLLECTIONS = ["users", "scores", "wcMatches", "wcStandings", "bracket", "config"];

export async function GET(req: NextRequest) {
  // Verify cron secret so only the scheduler can trigger this.
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("key");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  // Read all top-level collections.
  const backup: Record<string, unknown[]> = {};
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get().catch(() => null);
    backup[col] = snap ? snap.docs.map((d) => ({ _id: d.id, ...d.data() })) : [];
  }

  // Also back up predictions (nested sub-collections).
  const predSnap = await db.collection("predictions").get().catch(() => null);
  if (predSnap) {
    const predictions: Record<string, unknown> = {};
    for (const userDoc of predSnap.docs) {
      const uid = userDoc.id;
      const [mSnap, gSnap, tSnap] = await Promise.all([
        db.collection("predictions").doc(uid).collection("matches").get().catch(() => null),
        db.collection("predictions").doc(uid).collection("groups").get().catch(() => null),
        db.collection("predictions").doc(uid).collection("meta").get().catch(() => null),
      ]);
      predictions[uid] = {
        matches: mSnap ? mSnap.docs.map((d) => d.data()) : [],
        groups:  gSnap ? gSnap.docs.map((d) => d.data()) : [],
        meta:    tSnap ? tSnap.docs.map((d) => d.data()) : [],
      };
    }
    backup["predictions"] = [predictions];
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const json = JSON.stringify(backup, null, 2);

  // Try to save to Firebase Storage if available; otherwise return JSON inline.
  const storage = getAdminStorage();
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (storage && bucketName) {
    try {
      const file = storage.bucket(bucketName).file(`backups/backup-${timestamp}.json`);
      await file.save(Buffer.from(json), { contentType: "application/json" });
      return NextResponse.json({ ok: true, file: `backups/backup-${timestamp}.json`, timestamp });
    } catch {
      // Storage unavailable — fall through to inline response.
    }
  }

  // Fallback: return the backup as JSON directly (downloadable from Vercel logs).
  return new NextResponse(json, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="backup-${timestamp}.json"` },
  });
}
