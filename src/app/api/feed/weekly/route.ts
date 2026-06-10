import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { gatherWeeklyData, buildWeeklyTimes, snapshotFromGroups } from "@/lib/weeklyTimes";

export const dynamic = "force-dynamic";

/**
 * Generate the weekly "Global Football Cup Times" edition.
 *  - GET  : Vercel Cron (Authorization: Bearer CRON_SECRET) — generates & persists.
 *  - POST : admin token. Body { preview?: true } generates WITHOUT persisting
 *           (and without advancing the standings snapshot) for the admin tester.
 */
async function handle(req: NextRequest, persistDefault: boolean) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && auth === `Bearer ${secret}`;
  const admin = isCron ? { uid: "cron" } : await requireAdmin(req);
  if (!isCron && !admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  let preview = !persistDefault;
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { preview?: boolean };
    if (body.preview) preview = true;
  }

  const data = await gatherWeeklyData(db);
  const times = await buildWeeklyTimes(data);

  if (!preview) {
    await db.collection("weeklyTimes").doc(times.id).set(times);
    await db.collection("weeklySnapshots").doc(times.weekEnd).set(snapshotFromGroups(data.groups));
  }

  return NextResponse.json({
    ok: true,
    preview,
    times,
    hasKey: !!process.env.GEMINI_API_KEY,
  });
}

export async function GET(req: NextRequest) {
  return handle(req, true); // cron → persist
}
export async function POST(req: NextRequest) {
  return handle(req, true); // admin → persist unless {preview:true}
}
