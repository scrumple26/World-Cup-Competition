/**
 * Runtime configuration shared by client and server.
 *
 * Mock mode auto-activates whenever Firebase is not configured, so the whole
 * app runs against in-memory seed data during development. The moment real
 * Firebase env vars are present, the app uses Firebase instead — no code change.
 */

/** True when the Firebase Web SDK config is present (client-safe check). */
export const FIREBASE_WEB_CONFIGURED =
  !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

/** When true, the app uses in-memory mock data instead of Firebase. */
export const USE_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK === "1" || !FIREBASE_WEB_CONFIGURED;

/**
 * The single pick deadline — both "soft" and "hard" at the same instant.
 *
 * Before it: you may lock in any time, but any game that already kicked off
 * before your lock-in scores 0 (enforced in scoring via your lock-in time vs.
 * each match's kickoff). After it: total lockout — no new accounts, no lock-ins,
 * no pick edits (enforced server-side in the lock-in / predictions / profile
 * routes). Change this one value to move the deadline.
 *
 * Thursday December 31, 2026, 11:59 PM Central (CST, UTC-6).
 */
export const PICK_DEADLINE_ISO = "2026-12-31T23:59:00-06:00";
export const PICK_DEADLINE_MS = new Date(PICK_DEADLINE_ISO).getTime();

/** True once the hard deadline has passed (total lockout). */
export function isPastPickDeadline(now: number = Date.now()): boolean {
  return now > PICK_DEADLINE_MS;
}

export const ADMIN_EMAIL = (
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ??
  process.env.ADMIN_EMAIL ??
  "nolan.leyse@yahoo.com"
).toLowerCase();

export const firebaseWebConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
