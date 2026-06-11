import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { sendPredictionReminderEmail } from "@/lib/email";
import { ADMIN_EMAIL } from "@/lib/config";
import { getFixtures } from "@/lib/apiFootball";
import { isGroupRound } from "@/lib/wc";
import type { UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Phase = "4h" | "1h";
type Mode = "send" | "test" | "dry";

/**
 * Kickoff (ms) of the earliest group-stage match, or null if it can't be
 * determined. Best-effort: used only as a soft "don't send after kickoff" guard,
 * so a fetch failure must never block a legitimate reminder.
 */
async function firstKickoffMs(): Promise<number | null> {
  try {
    const fixtures = await getFixtures();
    const times = fixtures
      .filter((f) => isGroupRound(f.league.round))
      .map((f) => new Date(f.fixture.date).getTime())
      .filter((t) => Number.isFinite(t));
    return times.length ? Math.min(...times) : null;
  } catch {
    return null;
  }
}

/** Real (non-bot) players with a usable email who have NOT locked in their picks. */
async function unlockedRecipients(db: Firestore): Promise<UserProfile[]> {
  const snap = await db.collection("users").get();
  const real = snap.docs
    .map((d) => d.data() as UserProfile)
    .filter((u) => !u.isBot && typeof u.email === "string" && u.email.includes("@"));

  const checked = await Promise.all(
    real.map(async (u) => {
      const lock = await db
        .collection("predictions")
        .doc(u.uid)
        .collection("meta")
        .doc("userLock")
        .get();
      return lock.exists ? null : u;
    }),
  );
  return checked.filter((u): u is UserProfile => u !== null);
}

async function run(opts: { phase: Phase; mode: Mode; force: boolean }) {
  const { phase, mode, force } = opts;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const stateRef = db.collection("reminders").doc("predictions");
  const sentKey = phase === "4h" ? "sent4h" : "sent1h";

  // Idempotency: a real send happens at most once per phase (cron repeats daily).
  if (mode === "send" && !force) {
    const state = (await stateRef.get()).data() ?? {};
    if (state[sentKey]) {
      return NextResponse.json({ ok: true, phase, skipped: "already-sent", state: state[sentKey] });
    }
  }

  // Soft guard: if the first match has already kicked off, predictions are
  // locked anyway — nothing to remind. Only applied to real sends.
  const kickoff = await firstKickoffMs();
  if (mode === "send" && kickoff !== null && Date.now() > kickoff) {
    return NextResponse.json({ ok: true, phase, skipped: "past-kickoff" });
  }

  const list = await unlockedRecipients(db);

  if (mode === "dry") {
    return NextResponse.json({
      ok: true,
      phase,
      dryRun: true,
      kickoff: kickoff ? new Date(kickoff).toISOString() : null,
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
    const r = await sendPredictionReminderEmail(t.email, t.firstName, phase);
    if (r.ok) sent++;
    else failures.push({ email: t.email, error: r.error ?? "unknown" });
  }

  if (mode === "send") {
    await stateRef.set(
      { [sentKey]: { at: Date.now(), candidates: list.length, sent, failed: failures.length } },
      { merge: true },
    );
  }

  return NextResponse.json({ ok: true, phase, mode, candidates: list.length, sent, failures });
}

function parsePhase(req: NextRequest): Phase | null {
  const p = req.nextUrl.searchParams.get("phase");
  return p === "4h" || p === "1h" ? p : null;
}

/**
 * GET /api/reminders/predictions?phase=4h|1h
 *  - Vercel Cron (Authorization: Bearer CRON_SECRET) → real send, idempotent per phase.
 *  - Admin (Firebase ID token) → can also pass &mode=dry (list recipients only) or
 *    &mode=test (send only to the admin) and &force=1 to bypass the once-per-phase guard.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && auth === `Bearer ${secret}`;
  const admin = isCron ? { uid: "cron" } : await requireAdmin(req);
  if (!isCron && !admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Read-only status: what (if anything) has been sent so far.
  if (!isCron && req.nextUrl.searchParams.get("mode") === "status") {
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });
    const state = (await db.collection("reminders").doc("predictions").get()).data() ?? {};
    return NextResponse.json({ ok: true, status: state });
  }

  const phase = parsePhase(req);
  if (!phase) return NextResponse.json({ error: "phase must be 4h or 1h" }, { status: 400 });

  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode: Mode =
    !isCron && (modeParam === "dry" || modeParam === "test") ? (modeParam as Mode) : "send";
  const force = !isCron && req.nextUrl.searchParams.get("force") === "1";

  return run({ phase, mode, force });
}

/**
 * POST /api/reminders/predictions  (admin only)
 * Body: { phase: "4h"|"1h", mode?: "send"|"test"|"dry", force?: boolean }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    phase?: string;
    mode?: Mode;
    force?: boolean;
  };
  const phase: Phase | null = body.phase === "4h" || body.phase === "1h" ? body.phase : null;
  if (!phase) return NextResponse.json({ error: "phase must be 4h or 1h" }, { status: 400 });

  const mode: Mode = body.mode === "test" || body.mode === "dry" ? body.mode : "send";
  return run({ phase, mode, force: !!body.force });
}
