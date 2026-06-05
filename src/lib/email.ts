import "server-only";
import { Resend } from "resend";

const FROM = "WC Competition <onboarding@resend.dev>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { margin:0; padding:0; background:#05111f; font-family:system-ui,Arial,sans-serif; color:#eef3fc; }
    .wrap { max-width:520px; margin:40px auto; padding:0 16px; }
    .card { background:#0d2040; border:1px solid #1a3560; border-radius:12px; overflow:hidden; }
    .header { background:#e31837; padding:24px 32px; text-align:center; }
    .header h1 { margin:0; font-size:20px; font-weight:700; color:#fff; letter-spacing:-.3px; }
    .header p { margin:4px 0 0; font-size:13px; color:rgba(255,255,255,.8); }
    .body { padding:32px; }
    .body p { margin:0 0 16px; font-size:15px; line-height:1.6; color:#c8d4ee; }
    .btn { display:inline-block; background:#e31837; color:#fff !important; text-decoration:none; padding:14px 28px; border-radius:8px; font-weight:700; font-size:15px; margin:8px 0 20px; }
    .footer { padding:20px 32px; border-top:1px solid #1a3560; font-size:12px; color:#7a90b8; }
    .footer a { color:#4ab3ff; }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="text-align:center;padding:20px 0 12px">
      <span style="font-size:32px">🏆</span>
    </div>
    <div class="card">
      <div class="header">
        <h1>World Cup 2026 Competition</h1>
        <p>${title}</p>
      </div>
      <div class="body">
        ${bodyHtml}
      </div>
      <div class="footer">
        This email was sent by the WC 2026 Competition app.
        If you didn't request this, you can safely ignore it.
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendVerificationEmail(
  toEmail: string,
  verificationLink: string,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not configured" };

  const html = baseTemplate(
    "Verify your email address",
    `<p>Thanks for joining! Click the button below to verify your email address and activate your account.</p>
     <p><a href="${verificationLink}" class="btn">Verify email address</a></p>
     <p>This link expires in <strong>1 hour</strong>. If it expires, sign in to request a new one.</p>`,
  );

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Verify your email — WC 2026 Competition",
    html,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not configured" };

  const html = baseTemplate(
    "Reset your password",
    `<p>We received a request to reset your password. Click the button below to choose a new one.</p>
     <p><a href="${resetLink}" class="btn">Reset password</a></p>
     <p>This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can ignore this email.</p>`,
  );

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Reset your password — WC 2026 Competition",
    html,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}
