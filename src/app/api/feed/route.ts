import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FeedEntry, FeedPost, WeeklyTimes } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed — returns the 20 most recent match feed entries, the 20 most
 * recent admin posts, and the 8 most recent weekly "Times" editions, newest first.
 */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ entries: [], posts: [], times: [] });

  const [entrySnap, postSnap, timesSnap] = await Promise.all([
    db.collection("feedEntries").orderBy("kickoff", "desc").limit(20).get(),
    db.collection("feedPosts").orderBy("createdAt", "desc").limit(20).get(),
    db.collection("weeklyTimes").orderBy("createdAt", "desc").limit(8).get().catch(() => null),
  ]);

  const entries = entrySnap.docs.map((d) => d.data() as FeedEntry);
  const posts = postSnap.docs.map((d) => d.data() as FeedPost);
  const times = timesSnap ? timesSnap.docs.map((d) => d.data() as WeeklyTimes) : [];
  return NextResponse.json({ entries, posts, times });
}
