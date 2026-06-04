# Manual Setup & Authorizations (do these at the END)

This file collects every step that requires **your** hands-on action (logins, account
creation, secret values). Everything else is built and tested without it. Work top to bottom.

---

## 1. Firebase project (Auth + Firestore)
- [ ] Go to https://console.firebase.google.com → **Add project** (name e.g. `world-cup-competition`). Disable Google Analytics (optional).
- [ ] **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
- [ ] **Build → Firestore Database → Create database → Production mode →** pick a region (e.g. `nam5`).
- [ ] **Project settings (gear) → General → Your apps → Web app (`</>`)** → register app → copy the `firebaseConfig` values.
- [ ] Paste them into `.env.local` under the `NEXT_PUBLIC_FIREBASE_*` keys.
- [ ] **Project settings → Service accounts → Generate new private key** (downloads a JSON).
- [ ] From that JSON, copy `project_id`, `client_email`, and `private_key` into `.env.local`
      (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
      Keep the `\n` escaping in the private key (wrap the whole value in double quotes).
- [ ] Deploy the Firestore security rules (command will be provided in `docs/` once written).

## 2. First admin login
- [ ] Run the app, sign up with **nolan.leyse@yahoo.com** — this account is auto-flagged admin.

## 3. Vercel deploy
- [ ] In the terminal here, run `! vercel login` and authenticate.
- [ ] I'll run the deploy; then add all `.env.local` values as Vercel **Environment Variables**
      (Production + Preview) — including `CRON_SECRET`.
- [ ] Confirm the Vercel Cron entry (in `vercel.json`) is active.

## 4. Security
- [ ] (Recommended) Rotate the API-Football key in your API-Football dashboard, since it was
      shared in chat, and update `API_FOOTBALL_KEY` locally + in Vercel.

---

_Generated incrementally during the build. Items get added here instead of interrupting you._
