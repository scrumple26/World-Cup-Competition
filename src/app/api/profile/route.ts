import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { assignFriendGroup, groupCounts } from "@/lib/groups";
import { ADMIN_EMAIL, isPastPickDeadline } from "@/lib/config";
import { sendSignupNotification } from "@/lib/email";
import type { FriendGroup, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/profile   (Authorization: Bearer <Firebase ID token>)
 * Returns the caller's profile document, or null if not created yet.
 */
export async function GET(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  return NextResponse.json(snap.exists ? snap.data() : null);
}

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

  const body = (await req.json().catch(() => ({}))) as {
    teamName?: string;
    firstName?: string;
    lastName?: string;
    logoUrl?: string;
  };
  const teamName = (body.teamName ?? "").trim();
  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  if (!teamName) return NextResponse.json({ error: "teamName required" }, { status: 400 });
  if (!firstName) return NextResponse.json({ error: "firstName required" }, { status: 400 });
  if (!lastName) return NextResponse.json({ error: "lastName required" }, { status: 400 });

  const ref = db.collection("users").doc(uid);
  const existing = await ref.get();
  if (existing.exists) return NextResponse.json(existing.data());

  // Hard lockout: no new accounts once the deadline has passed.
  if (isPastPickDeadline() && email !== ADMIN_EMAIL) {
    return NextResponse.json(
      { error: "Sign-ups are closed — the pick deadline has passed." },
      { status: 403 },
    );
  }

  // Balanced group assignment from current membership.
  const snap = await db.collection("users").get();
  const users = snap.docs.map((d) => d.data() as { friendGroup: FriendGroup });
  const friendGroup = assignFriendGroup(groupCounts(users));

  const profile: UserProfile = {
    uid,
    email,
    firstName,
    lastName,
    teamName,
    ...(body.logoUrl ? { logoUrl: body.logoUrl } : {}),
    friendGroup,
    isAdmin: email === ADMIN_EMAIL,
    createdAt: Date.now(),
  };
  await ref.set(profile);

  // Notify the admin a new player joined (non-fatal — never block sign-up).
  try {
    await sendSignupNotification({
      firstName, lastName, teamName, email, friendGroup,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json(profile);
}

/**
 * PATCH /api/profile  { logoUrl }   (Authorization: Bearer <Firebase ID token>)
 * Updates the caller's logoUrl in their profile document.
 */
export async function PATCH(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    logoUrl?: string;
    firstName?: string;
    lastName?: string;
    teamName?: string;
    hideScores?: boolean;
  };

  const updates: Record<string, string | boolean> = {};
  if (body.logoUrl)               updates.logoUrl    = body.logoUrl;
  if (body.firstName?.trim())     updates.firstName  = body.firstName.trim();
  if (body.lastName?.trim())      updates.lastName   = body.lastName.trim();
  if (body.teamName?.trim())      updates.teamName   = body.teamName.trim();
  if (body.hideScores !== undefined) updates.hideScores = body.hideScores;

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const ref = db.collection("users").doc(uid);
  await ref.update(updates);
  const updated = await ref.get();
  return NextResponse.json(updated.data());
}
