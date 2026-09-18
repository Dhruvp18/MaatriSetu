# Session handoff — 2026-09-19

Paste the block below into a new session. Update "Verified state" and "Next"
as work progresses.

---

You are continuing work on **MaatriSetu**, at `C:\DHRUV\VJTI\MaatriSetu`.

An assistive paper-to-digital antenatal consultation cockpit for high-volume
Indian OPDs, built for Health-a-thon 2026. A QR sticker on the mother's paper
file loads her verified obstetric history onto one screen. **Strictly
non-diagnostic**: it never diagnoses, scores risk, classifies a finding as
abnormal, or recommends a dose.

**Product name is MaatriSetu.** Decided. The Stitch title "MATRI-SYNC" is a
stale design-file label.

## Read first, in order

1. `README.md` — commands, hosted-DB workflow
2. `docs/architecture.md` — layering rules (ARCH-1..10). **Binding**, and
   enforced by ESLint per-directory.
3. `docs/development-foundation.md` — corrected data model. Supersedes PRD §8–9.
4. `docs/PRD.md` — original vision. Its schema section is deliberately NOT what
   was built.

Do not "simplify" the schema back toward PRD §8. Every departure is documented
in the migration headers and exists for a patient-safety reason.

## Verified state

Work is committed. `git log` starts at the foundation commit; check
`git status` before assuming anything is uncommitted.

- **17 migrations** apply cleanly; seed applies cleanly and is re-runnable
- **52 invariant checks** pass, including 10 that evaluate RLS as `authenticated`
- **171 unit tests** across 8 files; `tsc --noEmit` and ESLint clean
- `node tools/smoke-live.mjs` — full live round trip green
- `node tools/check-session.mjs` — all four roles resolve to an actor

Confirm everything:

```
pnpm verify:schema && pnpm typecheck && pnpm test
node tools/smoke-live.mjs && node tools/check-session.mjs
```

**Database is live** (hosted Supabase, `ap-south-1` Mumbai for DPDP residency),
project ref `gbzmnjrwkcsyaxhkiysw`. `.env.local` is configured — do not
regenerate it. Sign-ins: `doctor@` / `nurse@` / `assistant@` /
`admin@maatrisetu.local`, password `maatrisetu`. All data synthetic.

## Built

```
src/core/           obstetrics/dating, errors, auth (permissions, actor,
                    session, credentials, safe-redirect), tokens, db, config
src/modules/        patients, pregnancies, visits  (five-file shape)
src/middleware.ts   Supabase session refresh + signed-out redirect
src/app/sign-in/    form, server actions
src/app/clinic/     authenticated shell, home, patients/new (registration)
tools/              smoke-live.mjs, check-session.mjs
```

## Conventions — follow for every new module

1. **Five files per module**: types, schema, **mapper**, repository, service.
   The mapper holds row types and row→domain mapping with no I/O, so
   patient-safety decisions in it are unit-testable without a database.
2. **Every multi-table write is a SQL routine** that persists *and* writes its
   `audit_events` row in one transaction; makes no authorization decisions;
   `set search_path = public, pg_temp`; revoked from `public, anon,
   authenticated` and granted to `service_role`. The REST client cannot span
   tables, so without this a clinical write with no audit row is reachable.
3. **Version-checked updates** raise `serialization_failure`, mapped to 409.
4. **Reads use `userClient()`** (RLS as an independent second check); **writes
   use `serviceClient()`**. State which and why at every call site.
5. **Model "not known" and "not permitted" as separate types, never null**:
   `PregnancyDating`, `PatientSearchResult`, `AllergyRecord`,
   `SessionResolution`. A nullable field collapses "never asked" into "the
   answer is no" — the exact failure this product exists to prevent.
6. **The actor carries `clinicTimezone`.** Gestational age is a calendar
   computation; never take "today" from the server clock.

## Gotchas — these will waste your time

**Database / tooling**
- `supabase start` does NOT work here (Docker healthy, large image pulls fail),
  so `pnpm db:start`, `db:reset`, `db:types` are INERT. Apply migrations with
  `psql`; the Supabase MCP connector is NOT available in every session.
- `pnpm verify:schema` DOES work. Run before every migration commit.
- psql is at `C:\Program Files\PostgreSQL\16\bin\psql.exe`, not on PATH.
  **Options first, URL last**: `psql -v ON_ERROR_STOP=1 -X -q -f f.sql -d "$URL"`.
  A bare positional URI makes psql ignore every following flag and exit 0
  having done nothing.
- `DATABASE_URL`'s password contains `@`, percent-encoded as `%40`. Do not
  "tidy" it — libpq stops parsing userinfo at a literal `@`.
- `pnpm exec supabase` fails; call `./node_modules/.bin/supabase`.

**RLS**
- `verify:schema` connects as `postgres` (BYPASSRLS), so policies are NOT
  evaluated by most checks. A self-referential `staff_users` policy reached the
  hosted database this way and broke every sign-in (fixed in 0017). The
  `readable_as_authenticated` checks now cover it — **add one for every new
  policied table**.
- An anon-key read returning 401 `42501` is CORRECT; 0012 revokes all table
  privileges from `anon`. Supabase's hint says to `GRANT SELECT ... TO anon` —
  **do not**. It would undo tenant isolation.
- 5 `rls_enabled_no_policy` advisories are intentional (deny-all,
  service-role only).

**Code**
- Generated RPC arg types are all non-null (Postgres catalogs carry no
  parameter nullability). Use the `Nullable<Args, 'p_x'>` pattern already in
  the repositories; never blanket-cast.
- Zod strips unknown keys by default and `.strict()` does NOT reach nested
  objects — every nested object needs its own. This already caused one real bug
  (an LMP silently accepting a gestational age).
- `auth.users.{confirmation_token, recovery_token, email_change_token_new,
  email_change}` are nullable with no default; GoTrue scans them into Go
  strings, so NULL breaks sign-in with "converting NULL to string is
  unsupported". `seed.sql` and `verify-schema.sh` set them to `''`.
- `audit_events` is append-only and references `staff_users`, so staff rows
  cannot be deleted once anything happens in a clinic. The seed's tenancy
  inserts are `ON CONFLICT DO NOTHING` for this reason.

**Environment**
- The dev server may land on 3001/3002 — a stale process holds 3000. Read the
  `pnpm dev` output; don't assume.
- Playwright's Chrome launch times out (~3 min). Verify pages with curl.

## Decided — do not reopen

- Demo window ~4–6 weeks from 2026-09-18. All four pillars must genuinely work.
- Voice intake is in-app audio upload, not live WhatsApp.
- Supabase, not Neon. 6 accordions per PRD, not the 8-accordion Stitch screen.
- Automated clinical replies to patients stay disabled.

## Next

Continue the vertical slice:

1. **Patient search** → `patients.service.searchPatients`. It is the QR-lost
   fallback (PRD §11) and the entry point to everything below.
2. **Pregnancy episode + vitals** for a registered patient.
3. **QR issue + print** (`issue_patient_qr`), then **scan** →
   `getPatientByQrToken`.
4. **Cockpit read** — 6 accordions, POG computed live, "dating not established"
   rendered honestly for the seeded patient with no anchor (Lakshmi Yadav).
   The Hb trend MUST read from `observations`, not `finding_pins` — the seeded
   data (11.2 → 9.8 → 8.6, only the latest pinned) exists to prove this.
5. **Save & Next** — atomic, versioned, idempotent. `idempotency_requests` and
   `src/core/idempotency/` are both still empty.
6. **MCP slip print.**

Run `pnpm verify:schema`, `pnpm typecheck`, `pnpm test` and
`node tools/smoke-live.mjs` before declaring anything done, and say plainly
what is verified versus merely written.

## Not yet verified

The registration form has never been submitted through a real browser session.
Next's server actions make that impractical with curl and Playwright times out
here, so the form's happy path is written-but-unproven; the service beneath it
is covered by `smoke-live.mjs`. Worth one manual pass at
`/clinic/patients/new`.
