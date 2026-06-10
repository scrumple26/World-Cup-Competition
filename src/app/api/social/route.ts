import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FauxTweet } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

/** GET /api/social — the 40 most recent faux fan tweets, newest first. */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ tweets: [] });
  const snap = await db.collection("tweets").orderBy("createdAt", "desc").limit(40).get().catch(() => null);
  const tweets = snap ? snap.docs.map((d) => d.data() as FauxTweet) : [];
  return NextResponse.json({ tweets });
}
