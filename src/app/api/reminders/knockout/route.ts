import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { sendSemifinalPicksReminderEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/config";
import type { UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Mode = "send" | "test" | "dry";

/** Real users with email whose knockout picks are currently unlocked. */
async function unlockedKnockoutRecipients(db: Firestore): Promise<UserProfile[]> {
  const usersSnap = await db.collection("users").get();
  const real = usersSnap.docs
    .map((d) => d.data() as UserProfile)
    .filter((u) => !u.isBot && typeof u.email === "string" && u.email.includes("@"));

  const checked = await Promise.all(
    real.map(async (u) => {
      const unlockSnap = await db
        .collection("predictions")
        .doc(u.uid)
        .collection("meta")
        .doc("knockoutUnlock")
        .get();
      return unlockSnap.exists ? u : null;
    }),
  );
  return checked.filter((u): u is UserProfile => u !== null);
}

async function run(mode: Mode) {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const list = await unlockedKnockoutRecipients(db);
  if (mode === "dry") {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      count: list.length,
      recipients: list.map((u) => ({ email: u.email, firstName: u.firstName, teamName: u.teamName })),
    });
  }

  const targets: Array<{ email: string; firstName: string }> =
    mode === "test"
      ? [{ email: ADMIN_EMAIL, firstName: "Admin" }]
      : list.map((u) => ({ email: u.email, firstName: u.firstName }));

  let sent = 0;
  const failures: Array<{ email: string; error: string }> = [];
  for (const t of targets) {
    const r = await sendSemifinalPicksReminderEmail(t.email, t.firstName);
    if (r.ok) sent++;
    else failures.push({ email: t.email, error: r.error ?? "unknown" });
  }

  return NextResponse.json({ ok: true, mode, candidates: list.length, sent, failures });
}

/**
 * POST /api/reminders/knockout (admin only)
 * Body: { mode?: "send"|"test"|"dry" }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { mode?: Mode };
  const mode: Mode = body.mode === "test" || body.mode === "dry" ? body.mode : "send";
  return run(mode);
}
