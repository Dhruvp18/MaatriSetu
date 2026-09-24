# Deploy MaatriSetu — agent brief

You are deploying **MaatriSetu**, a Next.js 15 antenatal-clinic app, from the repo at
`C:\DHRUV\VJTI\MaatriSetu` (GitHub: `Dhruvp18/MaatriSetu`, branch `main`). The code is
deployment-ready: `pnpm typecheck`, `pnpm test` (280 tests), `pnpm build` and
`pnpm verify:schema` all pass. Your job is infrastructure, not code. Do not refactor.

## Architecture you are deploying

| Piece | Where | Why |
|---|---|---|
| Next.js web app (clinic + patient portal) | **Vercel**, region `bom1` (see `vercel.json`) | serverless is fine for request/response |
| Background worker (`worker/src/index.ts`) | **Render** background worker, blueprint `render.yaml` | an infinite poll loop that drains voice-transcription and report-OCR queues; Vercel cannot host it |
| Postgres + Auth + Storage | **Supabase**, project ref `gbzmnjrwkcsyaxhkiysw` (ap-south-1, Mumbai) | already provisioned; all 27 migrations applied — **do not run migrations** |

Tools: Vercel MCP (or `vercel` CLI), Render MCP (or Render dashboard), Supabase MCP.

## Secrets

Every value lives in `.env.local` at the repo root. Read it; never print a secret in chat,
logs, commits or PR text, and never commit `.env.local`. Do not add `ANTHROPIC_API_KEY` or
`REFERRAL_TOKEN_SECRET` anywhere — both are obsolete.

## Steps

### 1. Commit and push (ask the user first)
Most recent work is uncommitted. Show `git status`, confirm with the user, then commit on a
branch or `main` as they choose and push. Vercel and Render build from GitHub.

### 2. Vercel — web app
1. Create/link a Vercel project to `Dhruvp18/MaatriSetu`, framework Next.js, root `/`.
   `vercel.json` already sets install/build commands and region `bom1`.
2. Set these env vars for **Production and Preview**, values from `.env.local` unless stated:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (mark sensitive)
   - `APP_BASE_URL` = the production URL, e.g. `https://<project>.vercel.app` (NOT localhost)
   - `REFERRAL_TOKEN_TTL_HOURS`, `CLINIC_PHONE_NUMBER`
   - `PATIENT_SESSION_SECRET` (sensitive)
   - `PATIENT_DEMO_SESSION` — **ask the user**. `true` makes the patient portal show the
     seeded demo patient to anyone without a session (needed for a hackathon demo, since the
     paper QR sticker holds a bare token, not a URL). Must be `false` if real patients exist.
   - `OCR_PROVIDER=gemini`, `SPEECH_PROVIDER=sarvam`, `MESSAGING_PROVIDER=disabled`
   - `GEMINI_API_KEY` (sensitive), `GEMINI_MODEL=gemini-3.1-flash-lite`, `SARVAM_API_KEY` (sensitive)
   - `ENABLE_EXPERIMENTAL_COREPACK=1` (the repo pins pnpm 11.9.0 via `packageManager`)
3. Deploy production. If the build fails, report the log — do not change code to force it.
4. If the final domain differs from what you put in `APP_BASE_URL`, fix it and redeploy.

### 3. Supabase — auth URLs
In the Supabase project (dashboard: Authentication → URL Configuration): set **Site URL** to
the Vercel production URL and add `https://<domain>/**` to **Redirect URLs**. Also enable
**Leaked password protection** (Auth → Passwords); the security advisor flags it.

### 4. Render — worker
1. New Blueprint from the repo; Render reads `render.yaml` (service `maatrisetu-worker`,
   region singapore, plan starter — background workers are not on the free plan; confirm the
   cost with the user).
2. Fill every `sync: false` env var from `.env.local`, with `APP_BASE_URL` = the Vercel URL.
3. Deploy. Healthy logs show `[worker] starting`, `speech provider: sarvam`,
   `ocr provider: gemini`, then quiet polling.

### 5. Smoke test (report pass/fail for each)
- `https://<domain>/sign-in` loads; a staff user (ask the user for demo credentials) can sign
  in and reach `/clinic`.
- `/clinic` home renders (today's list, patient-queries strip).
- `https://<domain>/referral/does-not-exist` renders a not-available page, not a 500.
- `/patient` — with demo on, shows Sunita Devi's dashboard; with demo off, shows "scan your QR".
- Patient chat: send "I have bleeding" → CRITICAL reply with the clinic phone link.
- Upload a small (< 4 MB) JPEG of a lab slip from the clinic cockpit → within ~30 s the worker
  log shows `[ocr] … ok` and candidates appear for review.
- Record a short voice note → worker log shows `[voice] … ok`.
- Supabase MCP `get_advisors` (security) shows nothing new beyond the known INFO items.

## Known limits — report, do not "fix"
- **Uploads > 4.5 MB fail on Vercel** (platform request-body cap), although the app allows
  12 MB. Phone photos are often 3–8 MB. Tell the user; the proper fix (direct-to-Storage
  signed upload or client-side compression) is a code change.
- Gemini 2.x models are closed to this API key; do not switch `GEMINI_MODEL` to a 2.x id.
- Supabase migration history has `0024`/`0025` recorded out of band on 2026-09-24. That is
  expected; do not re-apply them.

## Done means
Report back: production URL, Render service URL/status, the smoke-test table, the value
chosen for `PATIENT_DEMO_SESSION`, and anything you could not do and why.
