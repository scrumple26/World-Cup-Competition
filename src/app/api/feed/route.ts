import "server-only";
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { FeedEntry, FeedPost } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

/**
 * GET /api/feed — returns the 20 most recent match feed entries plus the 20
 * most recent admin posts, both newest first.
 */
export async function GET() {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ entries: [], posts: [] });

  const [entrySnap, postSnap] = await Promise.all([
    db.collection("feedEntries").orderBy("kickoff", "desc").limit(20).get(),
    db.collection("feedPosts").orderBy("createdAt", "desc").limit(20).get(),
  ]);

  const entries = entrySnap.docs.map((d) => d.data() as FeedEntry);
  const posts = postSnap.docs.map((d) => d.data() as FeedPost);
  return NextResponse.json({ entries, posts });
}
