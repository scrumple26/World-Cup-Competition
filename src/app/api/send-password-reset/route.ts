import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/send-password-reset   { email }
 * Generates a Firebase password reset link and delivers it via Resend.
 * No auth required — anyone can request a reset (silently no-ops for unknown emails).
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  try {
    // Verify user exists (silently succeed if not, to prevent email enumeration)
    await auth.getUserByEmail(email.toLowerCase().trim());
  } catch {
    // Unknown email — return success to avoid enumeration
    return NextResponse.json({ ok: true });
  }

  try {
    const link = await auth.generatePasswordResetLink(email.toLowerCase().trim());
    const result = await sendPasswordResetEmail(email, link);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
