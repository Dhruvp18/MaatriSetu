# Deploy MaatriSetu — agent brief

You are deploying **MaatriSetu**, a Next.js 15 antenatal-clinic app, from the repo at
`C:\DHRUV\VJTI\MaatriSetu` (GitHub: `Dhruvp18/MaatriSetu`, branch `main`). The code is
deployment-ready: typecheck, lint, `pnpm test` (285 tests), `pnpm build` and
`pnpm verify:schema` all pass. Your job is infrastructure, not code. Do not refactor.

## Architecture: everything on free tiers, no always-on server

| Piece | Where | Cost |
|---|---|---|
| Next.js app — clinic, patient portal, **and the background processing** | **Vercel** Hobby, region `bom1` (`vercel.json`) | free |
| Postgres, Auth, Storage, **the once-a-minute scheduler** (pg_cron + pg_net) | **Supabase** free plan, project `gbzmnjrwkcsyaxhkiysw` (ap-south-1, Mumbai) | free |

There is **no separate worker service** — do not create one on Render, Railway or anywhere
else. Voice transcription and report OCR are queue jobs, drained two ways:

1. **Immediately** — every action that queues work (report upload, voice note, patient
   upload) calls `drainQueues()` in Next.js `after()`, so processing starts right after the
   response is sent.
2. **Every minute, as the safety net** — a pg_cron job in Supabase (migration 0028, already
   applied and active) POSTs to `https://<domain>/api/queue/drain` with a bearer secret. It
   retries failures and anything a timed-out invocation left behind.

Overlap is safe: picking up an item is an atomic database claim, and a claim abandoned by a
crashed invocation expires after 10 minutes. The cron job is a **no-op until its two Vault
secrets exist** (step 3).

Tools: Vercel MCP (or `vercel` CLI) and Supabase MCP. **Do not run migrations** — all 28 are
applied. `pnpm worker:dev` exists only for local development.

## Current state (as of 2026-09-24)

A first deploy already exists: Vercel project `maatrisetu`, live at
**https://maatrisetu.vercel.app**, with 16 env vars set and `PATIENT_DEMO_SESSION=true`.
It predates the queue changes, so reports and voice notes currently **never get
processed** there. This brief brings it up to date; where a step is already done, verify it
and move on.

## Secrets

Every value lives in `.env.local` at the repo root. Read it; never print a secret in chat,
logs, commits or PR text; never commit `.env.local`. `ANTHROPIC_API_KEY` and
`REFERRAL_TOKEN_SECRET` are obsolete — if either exists in Vercel, delete it.

## Steps

### 1. Commit and push (ask the user first)
Show `git status` and confirm with the user before committing. Vercel builds from GitHub.
Note `render.yaml` was deliberately deleted — the deletion should be committed.

### 2. Vercel — env vars and deploy
Set for **Production and Preview**, values from `.env.local` unless stated:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | from `.env.local` (sensitive) |
| `APP_BASE_URL` | `https://maatrisetu.vercel.app` (NOT localhost) |
| `REFERRAL_TOKEN_TTL_HOURS`, `CLINIC_PHONE_NUMBER` | from `.env.local` |
| `PATIENT_SESSION_SECRET` | from `.env.local` (sensitive) |
| `QUEUE_DRAIN_SECRET` | from `.env.local` (sensitive) — **new, required for the cron** |
| `PATIENT_DEMO_SESSION` | `true` for the hackathon demo (user's choice). Anyone opening `/patient` sees the seeded demo patient — must be `false` once real patients exist |
| `OCR_PROVIDER` | `gemini` |
| `SPEECH_PROVIDER` | `sarvam` |
| `MESSAGING_PROVIDER` | `disabled` |
| `GEMINI_API_KEY`, `SARVAM_API_KEY` | from `.env.local` (sensitive) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` — Gemini 2.x models are closed to this key |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (repo pins pnpm 11.9.0) |

Then deploy production. If the build fails, report the log — do not change code to force it.

### 3. Supabase — connect the scheduler (Vault secrets)
Run via the Supabase MCP `execute_sql`, substituting the real secret from `.env.local`.
Do not echo the secret back in your report.

```sql
-- Re-runnable: removes any earlier value first.
delete from vault.secrets where name in ('queue_drain_url', 'queue_drain_secret');
select vault.create_secret('https://maatrisetu.vercel.app/api/queue/drain', 'queue_drain_url');
select vault.create_secret('<QUEUE_DRAIN_SECRET from .env.local>', 'queue_drain_secret');
```

Verify after ~2 minutes (expect status 202 rows; a 401 means the Vercel and Vault secrets
differ; no rows means the Vault secrets are missing):

```sql
select status_code, created
  from net._http_response
 order by created desc
 limit 5;

select status, return_message, start_time
  from cron.job_run_details
 order by start_time desc
 limit 5;
```

### 4. Supabase — auth settings (dashboard, by hand)
The Supabase MCP has no auth-config tool, so tell the user to do this in the dashboard, or
do it yourself if you have browser access:
- Authentication → URL Configuration: **Site URL** `https://maatrisetu.vercel.app`, and add
  `https://maatrisetu.vercel.app/**` to **Redirect URLs**.
- Authentication → Passwords: enable **Leaked password protection**.

### 5. Smoke test (report pass/fail for each)
- `/sign-in` loads; a staff user (ask the user for demo credentials) reaches `/clinic`.
- `/referral/does-not-exist` renders a not-available page, not a 500.
- `/patient` shows Sunita Devi's dashboard (demo on).
- Patient chat: "I have bleeding" → CRITICAL reply with the clinic phone link, and the
  question then appears in the clinic home's patient-queries strip.
- `curl -X POST https://maatrisetu.vercel.app/api/queue/drain` with **no** auth header → 401.
- Upload a small (< 4 MB) JPEG of a lab slip from the clinic cockpit → extracted candidates
  appear within ~1 minute. Vercel function logs show `[ocr] … ok`.
- Record a short voice note on `/clinic/voice` → it leaves "pending" within ~1 minute.
- Supabase `get_advisors` (security) shows nothing new beyond the known INFO items.

## Known limits — report, do not "fix"
- **Uploads over 4.5 MB fail on Vercel** (platform request-body cap), although the app
  allows 12 MB. Phone photos are often 3–8 MB. Fixing it is a code change (direct-to-Storage
  signed upload, or client-side compression).
- **Hobby functions are time-limited.** The drain stops starting new items after 40 s of a
  60 s budget; anything left waits for the next minute's cron run.
- **The free Supabase project pauses after a week without activity.** Open the dashboard
  before a demo if it has been idle.
- Supabase migration history has `0024`/`0025` recorded out of band on 2026-09-24. Expected.

## Done means
Report: production URL, env vars set (names only), the Vault/cron verification result, the
smoke-test table, and anything you could not do and why.
