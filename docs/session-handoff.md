# Session handoff — 2026-09-22

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

- **18 migrations** apply cleanly; seed applies cleanly and is re-runnable
- **60 invariant checks** pass, including 10 that evaluate RLS as `authenticated`
- **208 unit tests** across 11 files; `tsc --noEmit` and ESLint clean
- `node tools/smoke-live.mjs` — full live round trip green
- `node tools/check-session.mjs` — all four roles resolve to an actor
- `node tools/check-pages.mjs` — 78 checks on the *rendered* authenticated
  screens (needs `pnpm dev` running). It creates one throwaway patient through
  the service role to reach screens no seeded patient can, and removes it in a
  `finally`.

Confirm everything:

```
pnpm verify:schema && pnpm typecheck && pnpm test
node tools/smoke-live.mjs && node tools/check-session.mjs

pnpm dev                     # then, against the port it prints:
node tools/check-pages.mjs
```

`verify:schema` needs Docker Desktop running; it is the only check that does.

**Database is live** (hosted Supabase, `ap-south-1` Mumbai for DPDP residency),
project ref `gbzmnjrwkcsyaxhkiysw`. `.env.local` is configured — do not
regenerate it. Sign-ins: `doctor@` / `nurse@` / `assistant@` /
`admin@maatrisetu.local`, password `maatrisetu`. All data synthetic.

## Built

```
src/core/           obstetrics/dating, errors, auth (permissions, actor,
                    session, credentials, safe-redirect), tokens, db, config,
                    idempotency (request key + payload fingerprint)
src/modules/        patients, pregnancies, visits, reports (read), orders (read)
                    (five-file shape)
src/middleware.ts   Supabase session refresh + signed-out redirect
src/app/sign-in/    form, server actions
src/app/clinic/     authenticated shell, home,
                    patients (search), patients/new (registration),
                    patients/[id] (record + QR sticker issue & print),
                    patients/[id]/pregnancy/new (dating + GPLA),
                    patients/[id]/visit (open visit, record vitals),
                    patients/[id]/cockpit (6 accordions + Save & Next),
                    scan (keyboard-wedge sticker capture)
src/components/cockpit/  accordion (native details), header-banner, sparkline
tools/              smoke-live.mjs, check-session.mjs, check-pages.mjs
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
- Playwright's Chrome launch times out (~3 min), and server actions are not
  curl-able. Use `tools/check-pages.mjs`, which signs in and asserts rendered
  content — do not ship an authenticated screen without adding checks to it.
- Docker Desktop is often not running. Only `pnpm verify:schema` needs it;
  everything else runs against the hosted project.

## Decided — do not reopen

- Demo window ~4–6 weeks from 2026-09-18. All four pillars must genuinely work.
- Voice intake is in-app audio upload, not live WhatsApp.
- Supabase, not Neon. 6 accordions per PRD, not the 8-accordion Stitch screen.
- Automated clinical replies to patients stay disabled.

## Next

1. **MCP slip print** — the printable visit summary a mother leaves with
   (PRD F8). `globals.css` already carries A4 rules and an isolated sticker
   block to follow. Read from the SAVED visit, never recomputed.

2. **OCR ingestion** — `modules/reports` currently has a read path only. The
   write path is uploads -> extraction_runs -> report_candidates -> clinician
   verification, and verification must join the Save & Next commit rather than
   getting an endpoint of its own. Schema is complete (0006); no code.

3. **Emergency referral** — `modules/referrals` empty, schema complete (0010).
   Highest narrative value per unit of work, and no external dependency.

4. **Voice** — `modules/voice` empty, schema complete (0009). In-app audio
   upload, not live WhatsApp. Automated clinical replies stay disabled.

Also open: `visit_amendments` exists in the schema with no code path. A saved
consultation is corrected by amendment, and there is currently no way to make
one.

Run `pnpm verify:schema`, `pnpm typecheck`, `pnpm test`,
`node tools/smoke-live.mjs` and `node tools/check-pages.mjs` before declaring
anything done, and say plainly what is verified versus merely written.

## Not yet verified

**Server actions are never invoked over HTTP by any check.** Next does not emit
action ids into the HTML, and Playwright times out here, so form submissions —
registration, sticker issue, scan — are exercised only up to the service they
call. Each of those services is covered (`smoke-live.mjs` for the data layer,
unit tests for token and schema logic) and every page around them is covered by
`check-pages.mjs`, but the wiring between form and service is unproven. One
manual pass through register → issue sticker → scan it would close it.
