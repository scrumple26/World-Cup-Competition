# World Cup Competition 🏆

A 16-person **World Cup 2026 prediction league** among friends. A group stage feeds
into a head-to-head knockout bracket; you score points by predicting real World Cup
matches (data from **API-Football**). Built with **Next.js 14 + TypeScript + Tailwind**,
**Firebase** (Auth + Firestore), and deployed on **Vercel**.

## Features
- Email sign-up + team name, with random balanced assignment to 4 groups of 4.
- **Group-stage predictions**: score every WC match, drag-to-order each group's finish,
  pick the 8 advancing 3rd-place teams — plus a **flashcard entry mode**.
- **Knockout**: head-to-head bracket (top 2 per group, seeded 1–8), round-by-round
  predictions (WC R32 → R16 → QF+SF+Final) that unlock as fixtures publish.
- **Groups tab**: My Group / All Groups with standings and a cumulative-points chart.
- **Leaderboard**, **projected knockout bracket** with selectable teams, and **team
  profiles** showing each player's picks and results.
- **Admin** (one account): predict on behalf of a player, override a wrong result,
  manage groups, trigger a sync.
- **Rules** tab explaining all scoring and the WC format.

## Scoring (summary)
Per match: correct outcome **1**, exact home **0.5**, exact away **0.5**, perfect score
**+1** bonus. Group stage also: each correct group finish **1**, perfect group **+2**,
each correct advancing 3rd-place team **1**. Full details on the in-app Rules tab.

## Local development
```bash
npm install
npm run dev      # http://localhost:3000  (mock mode until Firebase is configured)
npm test         # scoring/league/bracket unit tests
npm run build    # production build + lint
```
**Mock mode** auto-activates when Firebase env vars are absent: the app runs on in-memory
sample players so you can click through every screen. Real WC fixtures/standings always
come live from API-Football.

## Configuration
Copy `.env.example` → `.env.local` and fill in (see **docs/MANUAL_SETUP.md** for the
step-by-step). Keys: API-Football, Firebase Web config, Firebase Admin service account,
`ADMIN_EMAIL`, `CRON_SECRET`. `.env.local` is gitignored — never commit secrets.

## Architecture
- `src/lib/scoring.ts`, `computeScore.ts`, `league.ts`, `bracket.ts` — pure, tested logic.
- `src/lib/apiFootball.ts` + `/api/wc/*` — server-side API-Football proxy (key hidden).
- `/api/sync` — Vercel Cron refreshes results/standings and recomputes scores.
- `/api/admin/*`, `/api/profile` — token-gated server writes (Firestore via Admin SDK).
- `src/lib/firebase/*`, `predictionsRepo.ts`, `scoresRepo.ts` — data layer that swaps
  between mock (localStorage) and Firebase with no UI changes.

## Deploy
See **docs/MANUAL_SETUP.md** and **NEXT_STEPS.md**. In short: create a Firebase project,
paste config into `.env.local`, deploy Firestore rules, then `vercel` deploy with the
same env vars set in the Vercel dashboard.
