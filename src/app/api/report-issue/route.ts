import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let email: string;
  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    email = decoded.email ?? "unknown";
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { message, name, teamName } = (await req.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
    teamName?: string;
  };

  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  const resend = new Resend(resendKey);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "nolan.leyse@yahoo.com";

  const { error } = await resend.emails.send({
    from: "WC 2026 Competition <noreply@globalfootballcup.com>",
    to: adminEmail,
    subject: `Issue reported by ${name ?? email}`,
    text: `Issue report from ${name ?? "unknown"} (${teamName ?? ""} · ${email} · uid: ${uid})\n\n${message}`,
    html: `
      <div style="font-family:system-ui,Arial;max-width:520px;padding:24px">
        <h2 style="color:#e31837;margin:0 0 16px">⚠️ Issue Report — WC 2026 Competition</h2>
        <table style="font-size:14px;color:#333;margin-bottom:20px">
          <tr><td style="color:#888;padding:2px 12px 2px 0">From</td><td><b>${name ?? "—"}</b></td></tr>
          <tr><td style="color:#888;padding:2px 12px 2px 0">Team</td><td>${teamName ?? "—"}</td></tr>
          <tr><td style="color:#888;padding:2px 12px 2px 0">Email</td><td>${email}</td></tr>
          <tr><td style="color:#888;padding:2px 12px 2px 0">UID</td><td style="font-size:12px;color:#888">${uid}</td></tr>
        </table>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-size:15px;line-height:1.6;white-space:pre-wrap">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      </div>`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
