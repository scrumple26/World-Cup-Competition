# Where to pick up from

_Last updated: 2026-06-04_

## ✅ What's done
The entire app is built and runs end-to-end in **mock mode** (in-memory sample data),
verified screen-by-screen. All pure logic is unit-tested (30 tests passing) and the
production build is clean.

- **Phase 0** — Next.js 14 + TS + Tailwind scaffold; server-side API-Football client.
- **Phase 1** — Scoring engine (matches, group finish, 3rd place, seeding) + tests.
- **Phase 2** — Auth, team name, balanced random group assignment, app shell, admin gating.
- **Phase 3** — WC data layer: `/api/wc/fixtures|standings|match/[id]/insights`, `/api/sync`, cron.
- **Phase 4** — Group-stage predictions: match cards, drag-order finishes, 3rd-place picker,
  insights panel, lock-at-kickoff, **flashcard mode**; auto-save verified.
- **Phase 5** — Score recompute (server) + Groups tab (standings + cumulative chart) + Leaderboard.
- **Phase 6** — Knockout bracket (projected qualifiers/seeds, selectable teams) + knockout predictions.
- **Phase 7** — Team profiles (picks & results), Rules tab, Admin tab (predict-for-user,
  result override, group management, sync), README.

## ▶️ To go live (the only remaining work — all requires YOUR accounts)
Do these in order. Full click-by-click detail is in **docs/MANUAL_SETUP.md**.

1. **Create a Firebase project** → enable Email/Password auth + Firestore.
2. Paste the Firebase **web config** and a **service-account** into `.env.local`
   (`NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_*`). The app auto-switches off mock mode.
3. Deploy Firestore rules: `npx firebase deploy --only firestore:rules` (or paste
   `firestore.rules` in the console).
4. `npm run dev`, sign up as **nolan.leyse@yahoo.com** (auto-admin), confirm a write lands
   in Firestore.
5. **Deploy to Vercel**: `vercel login` → `vercel` → add all `.env.local` vars in the Vercel
   dashboard (Production + Preview), including `CRON_SECRET`.
6. Confirm the cron in `vercel.json` (or use an external cron / the Admin “Sync now” button —
   see the Vercel-plan note in docs/MANUAL_SETUP.md).
7. **Rotate the API-Football key** (it was shared in chat) and update it locally + in Vercel.

## 🔭 Nice-to-haves / future
- Live knockout-bracket winners (auto-resolve head-to-head once KO results arrive).
- Email/push reminders before kickoff lock.
- Per-match points breakdown on team profiles once results exist.
- Tighten Firestore rules to also enforce kickoff locks server-side.
