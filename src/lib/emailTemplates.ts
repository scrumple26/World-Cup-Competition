/**
 * Pure email HTML/text builders — no I/O, no `server-only`, so they can be
 * unit-tested and previewed directly. `email.ts` wraps these with Resend.
 */

import { ROUND_META, type FriendBracketRound } from "./knockoutReminders";

export const PREDICT_URL = "https://globalfootballcup.com/predictions";

/** Shared branded shell around an email body. */
export function baseTemplate(title: string, bodyHtml: string): string {
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

/** Format a kickoff time for email copy, e.g. "Sat, Jun 20, 4:00 PM GMT". Falls
 *  back to "" so templates never render "Invalid Date". */
export function formatKickoff(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

/** "Your <stage> is live" round-open email body. */
export function knockoutRoundOpenHtml(
  firstName: string,
  round: FriendBracketRound,
  kickoffMs?: number | null,
): string {
  const name = (firstName ?? "").trim() || "there";
  const { stage, picks } = ROUND_META[round];
  const when = formatKickoff(kickoffMs);
  return baseTemplate(
    `Your ${stage} is live`,
    `<p>Hi ${name},</p>
     <p>You're <strong>still in the competition</strong> — and your
        <strong>${stage}</strong> just opened. Picks for the <strong>${picks}</strong>
        are now live, and how you predict those games decides whether you advance.</p>
     ${when ? `<p>Your first game of the round kicks off <strong>${when}</strong>. Picks lock at kickoff.</p>` : ""}
     <p><a href="${PREDICT_URL}" class="btn">Make my ${stage} picks →</a></p>
     <p>Win this one and you're through to the next round. Good luck. ⚽</p>
     <p>Thanks,<br/><strong>The Global Football Cup Federation</strong></p>`,
  );
}

export function knockoutRoundOpenText(
  firstName: string,
  round: FriendBracketRound,
  kickoffMs?: number | null,
): string {
  const name = (firstName ?? "").trim() || "there";
  const { stage, picks } = ROUND_META[round];
  const when = formatKickoff(kickoffMs);
  return `WC 2026 Competition\n\nYour ${stage} is live\n\nHi ${name},\n\nYou're still in the competition — and your ${stage} just opened. Picks for the ${picks} are now live, and how you predict those games decides whether you advance.\n${when ? `\nYour first game of the round kicks off ${when}. Picks lock at kickoff.\n` : ""}\nMake your ${stage} picks: ${PREDICT_URL}\n\nWin this one and you're through to the next round. Good luck.\n\nThanks,\nThe Global Football Cup Federation\nglobalfootballcup.com`;
}

/** "2 hours to kickoff, you haven't picked" reminder body. */
export function knockoutPickReminderHtml(
  firstName: string,
  round: FriendBracketRound,
  kickoffMs?: number | null,
): string {
  const name = (firstName ?? "").trim() || "there";
  const { stage, picks } = ROUND_META[round];
  const when = formatKickoff(kickoffMs);
  return baseTemplate(
    `2 hours to your ${stage}`,
    `<p>Hi ${name},</p>
     <p>Heads up — your <strong>${stage}</strong> kicks off in about
        <strong>2 hours</strong>${when ? ` (<strong>${when}</strong>)` : ""}, and you
        <strong>haven't submitted your picks yet</strong>.</p>
     <p>Predictions for the <strong>${picks}</strong> lock the moment the first game
        starts. Any game you haven't filled in scores <strong>zero</strong> — and in a
        knockout, that's how you go out.</p>
     <p><a href="${PREDICT_URL}" class="btn">Finish my ${stage} picks →</a></p>
     <p>Don't get knocked out on a walkover. ⚽</p>
     <p>Thanks,<br/><strong>The Global Football Cup Federation</strong></p>`,
  );
}

export function knockoutPickReminderText(
  firstName: string,
  round: FriendBracketRound,
  kickoffMs?: number | null,
): string {
  const name = (firstName ?? "").trim() || "there";
  const { stage, picks } = ROUND_META[round];
  const when = formatKickoff(kickoffMs);
  return `WC 2026 Competition\n\n2 hours to your ${stage}\n\nHi ${name},\n\nHeads up — your ${stage} kicks off in about 2 hours${when ? ` (${when})` : ""}, and you haven't submitted your picks yet.\n\nPredictions for the ${picks} lock the moment the first game starts. Any game you haven't filled in scores zero — and in a knockout, that's how you go out.\n\nFinish your ${stage} picks: ${PREDICT_URL}\n\nDon't get knocked out on a walkover.\n\nThanks,\nThe Global Football Cup Federation\nglobalfootballcup.com`;
}
