# MaatriSetu

An assistive paper-to-digital consultation cockpit for high-volume Indian
antenatal OPDs. A QR sticker on the mother's existing paper file loads her
verified obstetric history onto one screen, so the OB-GYN spends the two-minute
consultation on the patient rather than the paperwork.

**MaatriSetu is not a diagnostic system.** It organizes and surfaces data that
already exists in the patient's records. It does not diagnose, score risk,
recommend doses, or give clinical advice. All clinical judgment stays with the
clinician, and nothing enters the permanent record without a clinician's explicit
verification.

> Status: pre-pilot development. Synthetic data only. Not cleared for use with
> real patient data — see `docs/development-foundation.md` §8 for the release
> gates that must be met first.

---

## Documentation

Read these in order:

| Document | Purpose |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Product vision, personas, feature requirements |
| [`docs/development-foundation.md`](docs/development-foundation.md) | Corrected data model, transaction rules, permissions. **Supersedes PRD §8–9.** |
| [`docs/architecture.md`](docs/architecture.md) | Layering rules, module anatomy, file placement |
| [`docs/stitch-setup.md`](docs/stitch-setup.md) | Design-tool access |

The visual reference is the Stitch project
*MATRI-SYNC Antenatal Consultation Cockpit*; a static export lives at
`docs/prototype/stitch-cockpit.html` for reading, never for importing.

---

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 22.13 | |
| pnpm | ≥ 11 | `corepack enable pnpm` |
| Docker | running | Required by the local Supabase stack |

---

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in, see below
pnpm dev
```

The app runs at <http://localhost:3000>.

### The database is hosted, not local

Development runs against a hosted Supabase project in **`ap-south-1` (Mumbai)**,
chosen so patient data stays in India under the DPDP Act. All migrations are
already applied there.

`supabase start` does **not** work on the current dev machine: Docker is healthy
but the large image pulls fail (TLS handshake timeout, truncated reads). So
`pnpm db:start`, `pnpm db:reset` and `pnpm db:types` are inert until that is
fixed. Migrations and type generation currently go through the Supabase MCP
connector instead. `pnpm verify:schema` is unaffected and is still the fast
feedback loop for a migration — it needs only a small `postgres:16-alpine`
image.

Two values in `.env.local` cannot be fetched by tooling and must be pasted by
hand:

| Variable | Where to get it |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Project Settings → API Keys → `service_role` → Reveal |
| `DATABASE_URL` | Dashboard → Settings → Database → reset the password, then copy the **Session pooler** URI |

Until `DATABASE_URL` is set, `supabase/seed.sql` cannot be loaded, so the hosted
database holds only the tenancy rows (one clinic, four staff). Load the full
synthetic demo data with:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Seeded sign-ins are `doctor@`, `nurse@`, `assistant@` and `admin@maatrisetu.local`,
password `maatrisetu`. Synthetic throughout.

Background jobs (OCR, speech-to-text, outbox delivery) run in a **separate
process** — the web server never awaits a model call:

```bash
pnpm worker:dev
```

### Everyday commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint, including the architecture import rules |
| `pnpm test` | Unit + integration tests |
| `pnpm db:reset` | Drop, re-migrate, re-seed. Destroys local data. **Needs the local stack.** |
| `pnpm db:types` | Regenerate `src/core/db/database.types.ts`. **Needs the local stack** — use the MCP connector meanwhile |
| `pnpm verify:schema` | Apply every migration + seed + invariant checks to a throwaway Postgres |

Regenerate `src/core/db/database.types.ts` after every migration and commit it.
The row types the repositories depend on come from that file; a hand-written
copy drifts from the schema without the compiler noticing.

### Verifying the schema without the full stack

`supabase start` pulls roughly 2 GB of images, and the large ones fail on
throttled connections. For fast feedback on a migration, use:

```bash
pnpm verify:schema
```

It spins up a throwaway `postgres:16-alpine`, stubs the few Supabase-managed
objects the migrations reference (the `auth` schema and the
anon/authenticated/service_role roles), then applies all migrations, the seed,
and `tests/integration/schema-invariants.sql` — which asserts the
patient-safety properties actually hold rather than merely being intended:
units are mandatory, extracted values carry provenance, audit rows cannot be
edited, an issued referral is frozen, a shared phone never auto-attaches a
voice note, and so on.

Since migration 0017 it also assumes the `authenticated` role and reads every
policied table, so a policy that cannot be evaluated — a self-referential one,
for instance — fails here rather than in production. The local stub grants the
same privileges a real Supabase project does; without them a query as
`authenticated` fails on privileges *before* any policy is reached, which
silently defeats the point of testing policies at all.

It still does not cover policy *outcomes* under a real signed-in user (which
rows a given member of staff can actually see). For that, run:

```bash
node tools/check-session.mjs
```

It signs in as each seeded role against the hosted project and issues exactly
the queries `resolveSession()` makes, so a policy that hides a staff row or a
membership shows up as a failed sign-in rather than as a puzzling
"no clinic access" screen.

### Verifying the authenticated screens

```bash
pnpm dev                     # note the port it prints
node tools/check-pages.mjs   # add the base URL if it is not :3000
```

Next's server actions are not curl-able and Playwright's Chrome launch times
out on this machine, so authenticated pages are otherwise easy to ship
unverified. This script signs in as each seeded role, encodes the session the
way `@supabase/ssr` expects to find it in a cookie, and fetches the pages.

It asserts **rendered content**, not status codes: that the Hb trend and
gestational age are actually computed, that the seeded patient with no dating
anchor reads "Dating not established" rather than showing an invented
gestation, and that an assistant's search results carry no demographics.

Run `pnpm verify:schema` before every migration commit.

---

## Repository layout

```
docs/        Specification and design reference. No application code.
supabase/    Forward-only SQL migrations and synthetic seed data.
src/app/     Next.js routing and rendering. Thin by rule.
src/modules/ Domain logic and authorization. The product lives here.
src/core/    Cross-cutting primitives with no domain knowledge.
src/components/  UI primitives and the composed cockpit.
worker/      Separate Node process for queued jobs.
tests/       Unit (pure) and integration (against the local stack).
```

Dependencies point downward only: `app → modules → core`. The routing layer may
not import a repository; modules may not import from `app`. Both rules are
enforced by ESLint. See [`docs/architecture.md`](docs/architecture.md) for the
full contract before adding files.

---

## Ground rules

These are not style preferences. Each one exists because violating it is a
patient-safety or medico-legal defect:

1. **Every measurement carries its unit.** A bare number crossing a boundary is a bug.
2. **"Unknown" is a value, not an absence.** An empty allergy field must never render as "no allergies".
3. **Nothing enters the permanent record without clinician verification.** Extraction output is a *candidate*.
4. **Clinical history is corrected by superseding, never by overwriting.**
5. **No automatic diagnosis, abnormality classification, or risk labelling.** If a label requires clinical judgment, a clinician enters it.
6. **Every clinical write is audited**, append-only, with actor and provenance.
7. **Synthetic data only.** No real patient data in this repository, ever.

---

## Licence

Not yet determined.
