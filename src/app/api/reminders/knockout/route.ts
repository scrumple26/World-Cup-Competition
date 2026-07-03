import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import { ADMIN_EMAIL } from "@/lib/config";
import {
  sendKnockoutRoundOpenEmail,
  sendKnockoutPickReminderEmail,
} from "@/lib/email";
import {
  loadKnockoutSnapshot,
  unsubmittedForRound,
  type KnockoutSnapshot,
} from "@/lib/serverBracket";
import { survivorsForRound } from "@/lib/bracket";
import {
  decideKnockoutReminders,
  KO_REMINDER_ROUNDS,
  ROUND_META,
  type FriendBracketRound,
  type KnockoutReminderState,
} from "@/lib/knockoutReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Mode = "send" | "test" | "dry";
type Kind = "open" | "remind2h";

interface Recipient {
  email: string;
  firstName: string;
}

/** Real (non-bot) players with a usable email address, keyed by uid. */
function resolveRecipients(snap: KnockoutSnapshot, uids: string[]): Recipient[] {
  const out: Recipient[] = [];
  for (const uid of uids) {
    const u = snap.usersByUid.get(uid);
    if (!u || u.isBot) continue;
    if (typeof u.email !== "string" || !u.email.includes("@")) continue;
    out.push({ email: u.email, firstName: u.firstName });
  }
  return out;
}

async function run(req: NextRequest, opts: { mode: Mode; force: boolean }) {
  const { mode, force } = opts;
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const snap = await loadKnockoutSnapshot(db);
  if (!snap) return NextResponse.json({ ok: true, skipped: "no-data" });
  if (!snap.started) return NextResponse.json({ ok: true, started: false });

  const now = Date.now();

  // Survivors + who among them still hasn't picked, per round.
  const survivorsByRound = {} as Record<FriendBracketRound, string[]>;
  const unsubmittedByRound = {} as Record<FriendBracketRound, string[]>;
  for (const r of KO_REMINDER_ROUNDS) {
    const { teams } = survivorsForRound(snap.bracket, r);
    survivorsByRound[r] = teams.map((t) => t.uid);
    unsubmittedByRound[r] = unsubmittedForRound(snap, survivorsByRound[r], r, now);
  }

  // Effective state: stored flags, minus any the admin is force-resending.
  const stateRef = db.collection("reminders").doc("knockout");
  const stored = ((await stateRef.get()).data() ?? {}) as KnockoutReminderState;
  const state: KnockoutReminderState = force
    ? { open: {}, remind2h: {} }
    : { open: { ...stored.open }, remind2h: { ...stored.remind2h } };

  const plan = decideKnockoutReminders({
    now,
    started: snap.started,
    bracket: snap.bracket,
    openFixtureCount: snap.openFixtureCount,
    firstKickoff: snap.firstKickoff,
    unsubmittedByRound,
    state,
  });

  if (mode === "dry") {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      now: new Date(now).toISOString(),
      firstKickoff: snap.firstKickoff,
      survivorsByRound,
      plan: {
        open: plan.open.map((e) => ({
          round: e.round,
          recipients: resolveRecipients(snap, e.uids),
        })),
        remind: plan.remind.map((e) => ({
          round: e.round,
          recipients: resolveRecipients(snap, e.uids),
        })),
        skipped: plan.skipped,
      },
    });
  }

  const results: Array<{
    round: FriendBracketRound;
    kind: Kind;
    candidates: number;
    sent: number;
    failures: Array<{ email: string; error: string }>;
  }> = [];

  const sendOne = async (
    kind: Kind,
    round: FriendBracketRound,
    r: Recipient,
  ): Promise<{ ok: boolean; error?: string }> => {
    const kickoff = snap.firstKickoff[round];
    return kind === "open"
      ? sendKnockoutRoundOpenEmail(r.email, r.firstName, round, kickoff)
      : sendKnockoutPickReminderEmail(r.email, r.firstName, round, kickoff);
  };

  const dispatch = async (
    kind: Kind,
    entries: Array<{ round: FriendBracketRound; uids: string[] }>,
  ) => {
    for (const e of entries) {
      const recipients =
        mode === "test"
          ? [{ email: ADMIN_EMAIL, firstName: "Admin" }]
          : resolveRecipients(snap, e.uids);
      let sent = 0;
      const failures: Array<{ email: string; error: string }> = [];
      for (const r of recipients) {
        const res = await sendOne(kind, e.round, r);
        if (res.ok) sent++;
        else failures.push({ email: r.email, error: res.error ?? "unknown" });
      }
      results.push({ round: e.round, kind, candidates: recipients.length, sent, failures });

      // Persist the sent flag only on a real send, so cron never repeats a phase
      // but test/dry runs stay replayable.
      if (mode === "send") {
        const field = kind === "open" ? "open" : "remind2h";
        await stateRef.set(
          {
            [field]: {
              [e.round]: {
                at: now,
                stage: ROUND_META[e.round].stage,
                candidates: e.uids.length,
                sent,
                failed: failures.length,
              },
            },
          },
          { merge: true },
        );
      }
    }
  };

  await dispatch("open", plan.open);
  await dispatch("remind2h", plan.remind);

  return NextResponse.json({ ok: true, mode, results, skipped: plan.skipped });
}

async function authorize(
  req: NextRequest,
): Promise<{ isCron: boolean; ok: boolean }> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isCron = !!secret && auth === `Bearer ${secret}`;
  if (isCron) return { isCron: true, ok: true };
  const admin = await requireAdmin(req);
  return { isCron: false, ok: !!admin };
}

/**
 * GET /api/reminders/knockout
 *   - Vercel Cron (Authorization: Bearer CRON_SECRET) → evaluates every round and
 *     sends whatever is due (round-open + 2h reminders), idempotent per phase.
 *   - Admin (Firebase ID token) → &mode=dry (plan only), &mode=test (send each
 *     due template to the admin), &force=1 (ignore the once-per-phase guard),
 *     &mode=status (what's been sent so far).
 */
export async function GET(req: NextRequest) {
  const { isCron, ok } = await authorize(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isCron && req.nextUrl.searchParams.get("mode") === "status") {
    const db = getAdminDb();
    if (!db) return NextResponse.json({ error: "not configured" }, { status: 503 });
    const state = (await db.collection("reminders").doc("knockout").get()).data() ?? {};
    return NextResponse.json({ ok: true, status: state });
  }

  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode: Mode =
    !isCron && (modeParam === "dry" || modeParam === "test") ? (modeParam as Mode) : "send";
  const force = !isCron && req.nextUrl.searchParams.get("force") === "1";
  return run(req, { mode, force });
}

/** POST /api/reminders/knockout (admin) — body: { mode?, force? }. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { mode?: Mode; force?: boolean };
  const mode: Mode = body.mode === "test" || body.mode === "dry" ? body.mode : "send";
  return run(req, { mode, force: !!body.force });
}
