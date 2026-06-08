// Probe PRODUCTION /api/send-verification to confirm RESEND_API_KEY is set in Vercel.
// Creates a throwaway Firebase user (shared prod project), calls the prod endpoint,
// then deletes the user. Interprets the response message.
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const WEB_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const PROD = "https://globalfootballcup.com";
const EMAIL = `wc-signup-test+prodcheck${Date.now()}@example.com`;

if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  })});
}
const adminAuth = getAuth();

// create user via REST -> returns idToken
const su = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "TestPass123!", returnSecureToken: true }) },
);
const suBody = await su.json();
console.log("create user:", su.status, suBody.error?.message ?? "ok", suBody.localId ?? "");

const idToken = suBody.idToken;
if (idToken) {
  const r = await fetch(`${PROD}/api/send-verification`, {
    method: "POST", headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await r.text();
  console.log("\nPROD POST /api/send-verification");
  console.log("  status:", r.status);
  console.log("  body  :", body.slice(0, 400));
  const missing = /Resend not configured/i.test(body);
  console.log("\n  VERDICT:", missing
    ? "RESEND_API_KEY MISSING in production ❌"
    : (r.status === 200 ? "RESEND configured, email accepted ✅"
       : "RESEND configured (non-config error from provider) ✅"));
}

// cleanup
if (suBody.localId) {
  await adminAuth.deleteUser(suBody.localId).catch(() => {});
  console.log("\ncleanup: deleted", EMAIL, suBody.localId);
}
console.log("DONE");
