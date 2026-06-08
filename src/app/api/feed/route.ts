import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FeedEntry } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

/** GET /api/feed — returns the 20 most recent match feed entries, newest first. */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ entries: [] });

  const snap = await db
    .collection("feedEntries")
    .orderBy("kickoff", "desc")
    .limit(20)
    .get();

  const entries = snap.docs.map((d) => d.data() as FeedEntry);
  return NextResponse.json({ entries });
}
