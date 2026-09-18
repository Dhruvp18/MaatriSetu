# Session handoff — 2026-09-18

Paste the block below into a new session. Update the "Verified state" and
"Next" sections as work progresses.

---

You are continuing work on **MaatriSetu**, at `C:\DHRUV\VJTI\MaatriSetu`.

It is an assistive paper-to-digital antenatal consultation cockpit for
high-volume Indian OPDs, built for Health-a-thon 2026. A QR sticker on the
mother's paper file loads her verified obstetric history onto one screen. It is
**strictly non-diagnostic** — it never diagnoses, scores risk, classifies a
finding as abnormal, or recommends a dose.

## Read these first, in order

1. `README.md` — commands, ground rules
2. `docs/architecture.md` — layering rules (ARCH-1..10). **Binding.**
3. `docs/development-foundation.md` — corrected data model. **Supersedes PRD §8–9.**
4. `docs/PRD.md` — original product vision. Its schema section is deliberately
   NOT what was built; see below.

Do not "simplify" the schema back toward PRD §8. Every departure is documented
in the migration header comments and exists for a patient-safety reason.

## Verified state (all of this passes — do not re-litigate it)

- **12 migrations** in `supabase/migrations/` — apply cleanly
- **`supabase/seed.sql`** — applies cleanly, synthetic data only
- **26 invariant checks** in `tests/integration/schema-invariants.sql` — all pass
- **54 unit tests** — all pass; `tsc --noEmit` clean
- Run `pnpm verify:schema` to confirm all of the above in ~30 seconds

Already written:

```
src/core/obstetrics/dating.ts     gestational dating arithmetic (pure, tested)
src/core/errors/app-error.ts      error taxonomy + HTTP mapping
src/core/auth/permissions.ts      authorization matrix as data (tested)
src/core/auth/actor.ts            ActorContext, requirePermission
src/core/config/env.ts            validated env, providers default to fixtures
src/core/db/clients.ts            userClient() (RLS) and serviceClient() (bypasses RLS)
src/modules/patients/patient.types.ts
src/modules/patients/patient.schema.ts
```

Nothing is committed — everything is untracked. Do not commit unless asked.

## Critical gotchas — these will waste your time otherwise

- **`supabase start` does not work on this machine.** Docker is healthy, but
  large image pulls fail (`TLS handshake timeout`, truncated reads). Use
  `pnpm verify:schema` instead — it validates migrations + seed + invariants
  against a throwaway `postgres:16-alpine` with a stubbed `auth` schema.
- **`src/app/` is empty.** There is no `layout.tsx`, `page.tsx` or
  `globals.css` yet, so `pnpm dev` will not serve anything. Scaffolding these
  is part of the next task.
- **`pnpm exec supabase` fails**; call `./node_modules/.bin/supabase` directly.
- The Stitch design project is `2363914982225928169` (read access via Stitch
  MCP). Its sample data is internally inconsistent — LMP and POG correspond to
  different days. Generate seed data from the dating reference, never copy it
  from the design.

## Decisions already made — do not reopen

- Demo window ~4–6 weeks from 2026-09-18. **All four pillars must genuinely
  work**: cockpit + registration + QR, OCR ingestion, emergency referral,
  Sarvam voice triage.
- Voice intake is **in-app audio upload**, not live WhatsApp (Meta template
  approval is slow; the 24-hour session window blocks free-form replies).
- **Supabase**, not Neon. **6 accordions** per the PRD, not the extended
  8-accordion Stitch screen.
- Automated clinical replies to patients stay **disabled**.

## Next task

**1. Take the database live.** Check whether `SUPABASE_ACCESS_TOKEN` is set in
the environment.

- If set: create the project (`--region ap-south-1`, Mumbai, for DPDP data
  residency), `link`, `db push`, then `gen types typescript --linked` into
  `src/core/db/database.types.ts`. Generate the DB password in-shell and
  redirect `projects api-keys -o env` straight into `.env.local` so no secret
  ever enters the transcript.
- If not set: say so and continue with step 2 against hand-written row types.

**2. Finish the patients module** — `patient.repository.ts` and
`patient.service.ts`, following the four-file module shape in
`docs/architecture.md`. Every service function takes `ActorContext` first and
calls `requirePermission`.

**3. Then the first vertical slice**, in this order: `pregnancies` module →
`visits` module → `src/app` scaffolding → registration form → QR issue/scan →
cockpit read → Save & Next (atomic, versioned, idempotent) → MCP slip print.

Work in slices that can be run and judged. Run `pnpm verify:schema`,
`pnpm typecheck` and `pnpm test` before declaring anything done, and say
plainly what is verified versus merely written.

## Open questions for the user

- **Product name: MaatriSetu or MATRI-SYNC?** The PRD and the Stitch project
  disagree. It is already in `package.json`, `README.md`, migration comments
  and UI copy, and gets more expensive to change the longer it waits.
- `SUPABASE_SERVICE_ROLE_KEY` must be placed in `.env.local` by the user from
  the dashboard — never requested in chat.
