import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

export interface WeeklyMessage {
  text: string;
  updatedAt: number;
  updatedBy: string;
}

/** GET — returns the current weekly message (no auth required). */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ text: "", updatedAt: 0, updatedBy: "" });
  const snap = await db.collection("config").doc("weeklyMessage").get();
  return NextResponse.json(snap.exists ? snap.data() : { text: "", updatedAt: 0, updatedBy: "" });
}

/** POST — admin only, sets the weekly message. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { text, uid } = (await req.json().catch(() => ({}))) as { text?: string; uid?: string };
  const doc: WeeklyMessage = {
    text: (text ?? "").trim(),
    updatedAt: Date.now(),
    updatedBy: uid ?? "",
  };
  await db.collection("config").doc("weeklyMessage").set(doc);
  return NextResponse.json(doc);
}
