import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { MatchPrediction } from "@/lib/types";

export const runtime = "nodejs";

async function authenticate(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const admin = getAdminAuth();
    if (!admin) return null;
    const decodedToken = await admin.verifyIdToken(token);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await authenticate(req);
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const predictions = body.predictions as MatchPrediction[];

    if (!Array.isArray(predictions)) {
      return NextResponse.json({ error: "Invalid predictions" }, { status: 400 });
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }
    const now = Date.now();

    // Lock knockout predictions to Firestore
    const matchesMap: Record<number, MatchPrediction> = {};
    for (const p of predictions) {
      matchesMap[p.fixtureId] = {
        ...p,
        submittedAt: now,
      };
    }

    await db.collection("users").doc(uid).set(
      {
        knockoutMatches: matchesMap,
        knockoutLocked: true,
        knockoutLockedAt: new Date(now),
        knockoutDraft: null,
      },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lock-in failed";
    console.error("knockout lock-in error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
