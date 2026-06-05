import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/send-verification   (Authorization: Bearer <Firebase ID token>)
 * Generates a Firebase email verification link and delivers it via Resend.
 */
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let email: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    email = decoded.email ?? "";
    if (!email) throw new Error("No email on token");
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const link = await auth.generateEmailVerificationLink(email);
    const result = await sendVerificationEmail(email, link);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
