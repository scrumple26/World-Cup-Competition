import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { assignFriendGroup, groupCounts } from "@/lib/groups";
import { ADMIN_EMAIL } from "@/lib/config";
import type { FriendGroup, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/profile  { teamName }   (Authorization: Bearer <Firebase ID token>)
 * Creates the caller's profile with a balanced random group assignment and the
 * admin flag. Idempotent: returns the existing profile if already created.
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  let email: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
    email = (decoded.email ?? "").toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { teamName?: string };
  const teamName = (body.teamName ?? "").trim();
  if (!teamName) return NextResponse.json({ error: "teamName required" }, { status: 400 });

  const ref = db.collection("users").doc(uid);
  const existing = await ref.get();
  if (existing.exists) return NextResponse.json(existing.data());

  // Balanced group assignment from current membership.
  const snap = await db.collection("users").get();
  const users = snap.docs.map((d) => d.data() as { friendGroup: FriendGroup });
  const friendGroup = assignFriendGroup(groupCounts(users));

  const profile: UserProfile = {
    uid,
    email,
    teamName,
    friendGroup,
    isAdmin: email === ADMIN_EMAIL,
    createdAt: Date.now(),
  };
  await ref.set(profile);
  return NextResponse.json(profile);
}
