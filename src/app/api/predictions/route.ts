import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { ADMIN_EMAIL, isPastPickDeadline } from "@/lib/config";
import type { GroupPrediction, MatchPrediction, ThirdPlacePrediction } from "@/lib/types";

export const dynamic = "force-dynamic";

function toMatchRecord(predictions: MatchPrediction[]): Record<number, MatchPrediction> {
  return predictions.reduce<Record<number, MatchPrediction>>((acc, p) => {
    acc[p.fixtureId] = p;
    return acc;
  }, {});
}

type UserKnockoutData = {
  knockoutLocked?: boolean;
  knockoutMatches?: Record<string, MatchPrediction>;
  knockoutDraft?: object | null;
};

/**
 * GET /api/predictions?uid=...
 * Returns all predictions for a given user (Admin SDK, no auth required for reads).
 */
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({
      matches: {},
      groups: {},
      third: { advancing: [] },
      userLocked: false,
      draft: null,
      knockoutLocked: false,
      knockoutMatches: {},
      knockoutDraft: null,
    });
  }

  // Cheap summary mode (used by the nav bar): counts + lock status via
  // aggregation, ~4 reads instead of reading the full prediction set (~85).
  if (req.nextUrl.searchParams.get("summary")) {
    const predRef = db.collection("predictions").doc(uid);
    const [mAgg, gAgg, tSnap, lockSnap] = await Promise.all([
      predRef.collection("matches").count().get(),
      predRef.collection("groups").count().get(),
      predRef.collection("meta").doc("thirdPlace").get(),
      predRef.collection("meta").doc("userLock").get(),
    ]);
    const thirdCount = tSnap.exists ? ((tSnap.data() as ThirdPlacePrediction).advancing ?? []).length : 0;
    return NextResponse.json({
      matchCount: mAgg.data().count,
      groupCount: gAgg.data().count,
      thirdCount,
      userLocked: lockSnap.exists,
    });
  }

  const [mSnap, gSnap, tSnap, lockSnap, draftSnap, userSnap] = await Promise.all([
    db.collection("predictions").doc(uid).collection("matches").get(),
    db.collection("predictions").doc(uid).collection("groups").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("thirdPlace").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("userLock").get(),
    db.collection("predictions").doc(uid).collection("meta").doc("draft").get(),
    db.collection("users").doc(uid).get(),
  ]);

  const matches = toMatchRecord(
    mSnap.docs.map((d) => d.data() as MatchPrediction),
  );

  const groups: Record<string, GroupPrediction> = {};
  gSnap.forEach((d) => {
    const p = d.data() as GroupPrediction;
    groups[p.group] = p;
  });

  const third: ThirdPlacePrediction = tSnap.exists
    ? (tSnap.data() as ThirdPlacePrediction)
    : { advancing: [] };

  const draft = draftSnap.exists ? draftSnap.data() : null;
  const userData = userSnap.exists ? (userSnap.data() as UserKnockoutData) : null;
  const knockoutLocked = !!userData?.knockoutLocked;
  const knockoutMatches = toMatchRecord(
    Object.values(userData?.knockoutMatches ?? {}),
  );
  const knockoutDraft = userData?.knockoutDraft ?? null;

  return NextResponse.json({
    matches,
    groups,
    third,
    userLocked: lockSnap.exists,
    draft,
    knockoutLocked,
    knockoutMatches,
    knockoutDraft,
  });
}

/**
 * POST /api/predictions   (Authorization: ****** ID token>)
 * Body: { type: "match" | "group" | "third" | "draft" | "knockout-draft", payload }
 * Saves a single prediction using Admin SDK — bypasses Firestore client auth timing issues.
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

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

  // Hard lockout: no pick/draft writes after the deadline (admin may still act).
  if (isPastPickDeadline() && email !== ADMIN_EMAIL) {
    return NextResponse.json(
      { error: "The pick deadline has passed — predictions are locked." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    type?: "match" | "group" | "third" | "draft" | "knockout-draft";
    payload?: unknown;
  };

  const predRef = db.collection("predictions").doc(uid);

  try {
    if (body.type === "match") {
      const p = body.payload as MatchPrediction;
      await predRef.collection("matches").doc(String(p.fixtureId)).set(p, { merge: true });
    } else if (body.type === "group") {
      const p = body.payload as GroupPrediction;
      await predRef.collection("groups").doc(p.group).set(p);
    } else if (body.type === "third") {
      const p = body.payload as ThirdPlacePrediction;
      await predRef.collection("meta").doc("thirdPlace").set(p);
    } else if (body.type === "draft") {
      // Cross-device soft-save: the full in-progress draft, synced per user.
      await predRef.collection("meta").doc("draft").set(body.payload as object);
    } else if (body.type === "knockout-draft") {
      // Cross-device soft-save for knockout-only draft.
      await db.collection("users").doc(uid).set(
        { knockoutDraft: body.payload as object },
        { merge: true },
      );
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
