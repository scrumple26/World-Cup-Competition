import "server-only";
import { Resend } from "resend";
import { ADMIN_EMAIL } from "./config";

const FROM = "WC 2026 Competition <noreply@globalfootballcup.com>";
const PREDICT_URL = "https://globalfootballcup.com/predictions";

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
 * Reminder to players who have NOT locked in their predictions yet, sent before
 * the first match kicks off (and predictions lock).
 *   phase "4h" — the 4-hours-to-go nudge with full how-to instructions.
 *   phase "1h" — the final-hour, last-chance reminder.
 */
export async function sendPredictionReminderEmail(
  toEmail: string,
  firstName: string,
  phase: "4h" | "1h",
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "Resend not configured" };

  const name = (firstName ?? "").trim() || "there";

  const subject =
    phase === "4h"
      ? "⏰ 4 hours left to predict your 72 group games"
      : "🚨 Final hour — your predictions lock at kickoff";

  const html =
    phase === "4h"
      ? baseTemplate(
          "4 hours left to lock in your picks",
          `<p>Hi ${name},</p>
           <p>The World Cup is almost here — and your predictions <strong>aren't locked in yet</strong>.
              You've got about <strong>4 hours</strong> until the first match kicks off, and once it does,
              picks are locked for good.</p>
           <p>You have <strong>72 group-stage games</strong> to predict. Here's how to get them in:</p>
           <ol style="margin:0 0 16px;padding-left:20px;color:#c8d4ee;font-size:15px;line-height:1.7;">
             <li>Open your <strong>Predictions</strong> page.</li>
             <li>For each match, tap in your predicted <strong>score</strong> (e.g. 2–1). Every pick
                 <strong>auto-saves</strong>, so you can stop and come back any time.</li>
             <li>Scroll to the bottom, hit <strong>🔒 Lock In Predictions</strong>, review, then
                 <strong>Confirm &amp; lock in</strong>.</li>
           </ol>
           <p>💡 <strong>In a hurry?</strong> Try the <strong>Flashcard</strong> version — it walks you through
              one matchup at a time so you can rip through all 72 games fast. Open Predictions and switch
              to the <strong>Flashcards</strong> tab.</p>
           <p><a href="${PREDICT_URL}" class="btn">Make my predictions →</a></p>
           <p>Good luck — may your bracket be ever in your favour. ⚽</p>
           <p>Thanks,<br/><strong>The Global Football Cup Federation</strong></p>`,
        )
      : baseTemplate(
          "Final hour — predictions lock at kickoff",
          `<p>Hi ${name},</p>
           <p>This is your <strong>last reminder</strong>. Predictions lock when the first match kicks off
              in about <strong>1 hour</strong>, and you <strong>haven't locked yours in yet</strong>.</p>
           <p>Any games you don't fill in will score <strong>zero</strong> — don't leave points on the table.</p>
           <p>⚡ <strong>Fastest way to finish:</strong> open the <strong>Flashcard</strong> mode on your
              Predictions page, blitz through the remaining matchups, then scroll down and hit
              <strong>🔒 Lock In Predictions → Confirm</strong>.</p>
           <p><a href="${PREDICT_URL}" class="btn">Finish my predictions now →</a></p>
           <p>See you at kickoff.</p>
           <p>Thanks,<br/><strong>The Global Football Cup Federation</strong></p>`,
        );

  const text =
    phase === "4h"
      ? `WC 2026 Competition\n\n4 hours left to predict your 72 group games\n\nHi ${name},\n\nThe World Cup is almost here and your predictions aren't locked in yet. You have about 4 hours until the first match kicks off, and once it does picks are locked for good.\n\nYou have 72 group-stage games to predict. How to get them in:\n\n1. Open your Predictions page: ${PREDICT_URL}\n2. For each match, enter your predicted score (e.g. 2-1). Every pick auto-saves, so you can stop and come back any time.\n3. Scroll to the bottom, hit "Lock In Predictions", review, then Confirm & lock in.\n\nIn a hurry? Try the Flashcard version — it walks you through one matchup at a time so you can rip through all 72 games fast. Open Predictions and switch to the Flashcards tab.\n\nMake your predictions: ${PREDICT_URL}\n\nThanks,\nThe Global Football Cup Federation\nglobalfootballcup.com`
      : `WC 2026 Competition\n\nFinal hour — your predictions lock at kickoff\n\nHi ${name},\n\nThis is your last reminder. Predictions lock when the first match kicks off in about 1 hour, and you haven't locked yours in yet.\n\nAny games you don't fill in will score zero — don't leave points on the table.\n\nFastest way to finish: open the Flashcard mode on your Predictions page, blitz through the remaining matchups, then scroll down and hit "Lock In Predictions" → Confirm.\n\nFinish your predictions: ${PREDICT_URL}\n\nThanks,\nThe Global Football Cup Federation\nglobalfootballcup.com`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject,
    text,
    html,
  });

  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Reminder that Finals (knockout) picks are open. */
export async function sendSemifinalPicksReminderEmail(
  toEmail: string,
  firstName: string,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: "Resend not configured" };

  const name = (firstName ?? "").trim() || "there";
  const subject = "⚽ Finals picks are open — submit now";
  const html = baseTemplate(
    "Finals picks are open",
    `<p>Hi ${name},</p>
     <p>Your knockout predictions are open for the <strong>Finals</strong> — Quarter-finals, Semi-finals &amp; the Final.</p>
     <p>If you predict a draw score, that means the match goes to a shootout — you must also pick who wins.</p>
     <p><a href="${PREDICT_URL}" class="btn">Submit my Finals picks →</a></p>
     <p>Good luck!</p>
     <p>Thanks,<br/><strong>The Global Football Cup Federation</strong></p>`,
  );
  const text =
    `WC 2026 Competition\n\nFinals picks are open\n\nHi ${name},\n\n` +
    "Your knockout predictions are open for the Finals — Quarter-finals, Semi-finals & the Final.\n" +
    "If you predict a draw score, you must also pick the shootout winner.\n\n" +
    `Submit now: ${PREDICT_URL}\n\nThanks,\nThe Global Football Cup Federation\nglobalfootballcup.com`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject,
    text,
    html,
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
