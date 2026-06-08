// End-to-end backend test for the sign-up pipeline + cleanup.
// Loads env from .env.local, talks to live dev server + Firebase Admin.
import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ---- load .env.local ----
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const WEB_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = "http://localhost:3000";

// ---- admin init ----
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}
const adminAuth = getAuth();
const db = getFirestore();

const TEST_EMAIL = process.argv[2];           // sign-in test for this email
const TEST_PASSWORD = "TestPass123!";

async function restSignIn(email, password) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return { status: r.status, body: await r.json() };
}

if (TEST_EMAIL) {
  console.log("== Signing in test user via REST:", TEST_EMAIL);
  const si = await restSignIn(TEST_EMAIL, TEST_PASSWORD);
  console.log("   signIn status:", si.status, si.body.error?.message ?? "ok");
  const idToken = si.body.idToken;

  if (idToken) {
    // B) send-verification (resolve the Resend question)
    const sv = await fetch(`${BASE}/api/send-verification`, {
      method: "POST", headers: { Authorization: `Bearer ${idToken}` },
    });
    console.log("\n== POST /api/send-verification");
    console.log("   status:", sv.status, "body:", (await sv.text()).slice(0, 300));

    // C) profile creation (the post-verification server path)
    const pr = await fetch(`${BASE}/api/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ teamName: "QA Test FC", firstName: "Quinn", lastName: "Tester" }),
    });
    const prBody = await pr.json();
    console.log("\n== POST /api/profile (create)");
    console.log("   status:", pr.status, "body:", JSON.stringify(prBody));

    // D) GET profile to confirm persistence
    const gr = await fetch(`${BASE}/api/profile`, { headers: { Authorization: `Bearer ${idToken}` } });
    console.log("\n== GET /api/profile");
    console.log("   status:", gr.status, "body:", JSON.stringify(await gr.json()));
  }
}

// ---- cleanup all wc-signup-test+ users ----
console.log("\n== CLEANUP: removing wc-signup-test+ users");
const list = await adminAuth.listUsers(1000);
const testers = list.users.filter((u) => (u.email ?? "").startsWith("wc-signup-test+"));
for (const u of testers) {
  await db.collection("users").doc(u.uid).delete().catch(() => {});
  await adminAuth.deleteUser(u.uid).catch(() => {});
  console.log("   deleted:", u.email, u.uid);
}
console.log("   total removed:", testers.length);
console.log("\nDONE");
