import "server-only";
import { Resend } from "resend";
import { ADMIN_EMAIL } from "./config";

const FROM = "WC 2026 Competition <noreply@globalfootballcup.com>";

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
    .header p  { margin:4px 0 0; font-size:13px; color:rgba(255,255,255,.8); }
    .body { padding:32px; }
    .body p { margin:0 0 16px; font-size:15px; line-height:1.6; color:#c8d4ee; }
    .btn { display:inline-block; background:#e31837; color:#fff !important; text-decoration:none;
           padding:14px 28px; border-radius:8px; font-weight:700; font-size:15px; margin:8px 0 20px; }
    .footer { padding:20px 32px; border-top:1px solid #1a3560; font-size:12px; color:#7a90b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <div style="text-align:center;padding:20px 0 12px"><span style="font-size:32px">🏆</span></div>
    <div class="card">
      <div class="header">
        <h1>World Cup 2026 Competition</h1>
        <p>${title}</p>
      </div>
      <div class="body">${bodyHtml}</div>
      <div class="footer">
        Sent by WC 2026 Competition · <a href="https://globalfootballcup.com" style="color:#4ab3ff">globalfootballcup.com</a>
        <br/>If you didn't request this, you can safely ignore it.
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
  if (!resend) return { ok: false, error: "Resend not configured" };

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Verify your email - WC 2026 Competition",
    text: `WC 2026 Competition\n\nVerify your email address\n\nClick the link below to verify your email and activate your account:\n\n${verificationLink}\n\nThis link expires in 1 hour.\n\nIf you didn't sign up, ignore this email.\n\nglobalfootballcup.com`,
    html: baseTemplate(
      "Verify your email address",
      `<p>Thanks for joining! Click the button below to verify your email and activate your account.</p>
       <p><a href="${verificationLink}" class="btn">Verify email address</a></p>
       <p>This link expires in <strong>1 hour</strong>.</p>`,
    ),
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetLink: string,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "Resend not configured" };

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "Reset your password - WC 2026 Competition",
    text: `WC 2026 Competition\n\nReset your password\n\nClick the link below to choose a new password:\n\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\nglobalfootballcup.com`,
    html: baseTemplate(
      "Reset your password",
      `<p>We received a request to reset your password. Click the button below to choose a new one.</p>
       <p><a href="${resetLink}" class="btn">Reset password</a></p>
       <p>This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>`,
    ),
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Notify the admin that a new player has completed sign-up.
 * Sent to ADMIN_EMAIL when a profile is created (i.e. after email verification).
 */
export async function sendSignupNotification(profile: {
  firstName: string;
  lastName: string;
  teamName: string;
  email: string;
  friendGroup: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "Resend not configured" };

  const { firstName, lastName, teamName, email, friendGroup } = profile;
  const { error } = await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New sign-up: ${teamName}`,
    text: `New player joined WC 2026 Competition\n\nName: ${firstName} ${lastName}\nTeam: ${teamName}\nEmail: ${email}\nGroup: ${friendGroup}\n\nglobalfootballcup.com`,
    html: baseTemplate(
      "New player joined",
      `<p>A new player just completed sign-up:</p>
       <p><strong>${firstName} ${lastName}</strong> — ${teamName}<br/>
       ${email}<br/>Friend group ${friendGroup}</p>`,
    ),
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}
