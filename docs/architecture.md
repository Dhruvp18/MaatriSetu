# Architecture & file-structure rules

This document is the contract for where code lives and what may import what.
If a change does not fit these rules, change the rules deliberately in a PR —
do not route around them.

Companion documents:

- `docs/PRD.md` — product vision and requirements (the "why").
- `docs/development-foundation.md` — corrected data model and workflow decisions (the "what").
- This file — layering and file placement (the "where").

---

## 1. The four layers

Dependencies point **downward only**. An arrow means "may import from".

```
  app/          routing, rendering, HTTP        (Next.js owns this)
    |
    v
  modules/      domain logic + authorization    (the product lives here)
    |
    v
  core/         cross-cutting primitives        (knows no domain)
    |
    v
  (nothing)
```

`components/` sits beside `app/` and may import from `core/` and from a module's
**types and schemas only** — never a service or repository.

### Rule ARCH-1 — the routing layer is thin

`src/app/**` may contain: route definitions, request parsing, response shaping,
React rendering. It may **not** contain SQL, business rules, or authorization
decisions, and may **not** import a `*.repository.ts`. It calls a service.

This rule is enforced by ESLint (`no-restricted-imports` in `eslint.config.mjs`).

### Rule ARCH-2 — modules never import upward

`src/modules/**` may not import from `src/app/**` or `src/components/**`.
A module that needs a value from the request receives it as an argument.

### Rule ARCH-3 — core knows no domain

`src/core/**` may not import from `src/modules/**`. If a helper mentions
"pregnancy" or "referral", it belongs in a module, not in core.

The one deliberate exception is `core/obstetrics/` — it holds pure clinical
arithmetic (EDD from LMP, POG from a dating reference). It is domain *vocabulary*
but has no dependencies, no I/O and no authorization, so it stays in core where
it can be unit-tested in isolation and reused by the worker.

### Rule ARCH-4 — modules do not import each other's internals

A module may import another module's `*.types.ts` and `*.schema.ts`. To invoke
behaviour, it imports that module's **service**, never its repository. Cyclic
service dependencies are a design smell — extract the shared rule into core or
into a new module.

---

## 2. Anatomy of a module

Every domain module follows the same four-file shape. Same names every time, so
any file can be located without searching.

```
src/modules/<domain>/
  <domain>.types.ts        Domain types. No zod, no DB types. Pure TypeScript.
  <domain>.schema.ts       Zod schemas: input validation + parsing untrusted data.
  <domain>.repository.ts   The ONLY place that talks to the database for <domain>.
  <domain>.service.ts      Authorization + business rules. The module's public API.
```

Add further files as needed (`<domain>.mapper.ts`, `<domain>.errors.ts`), but the
four above are mandatory and carry fixed responsibilities:

| File | Owns | Must not |
| --- | --- | --- |
| `types` | The shape of domain concepts | Import anything runtime |
| `schema` | Validating input at the boundary | Contain business rules |
| `repository` | SQL / Supabase queries, row↔domain mapping | Make authorization decisions |
| `service` | Permission checks, invariants, transactions, audit | Contain raw SQL |

### Rule ARCH-5 — every service call is authorized

A service function's first argument is an `ActorContext` (who is acting, in which
clinic, with which role). The service checks membership **and** operation
permission before touching a repository. Hiding a button in the UI is not
authorization.

### Rule ARCH-6 — untrusted input is parsed, not cast

Anything from outside the process — HTTP bodies, OCR model output, STT output,
webhook payloads — is parsed with a zod schema before use. `as SomeType` on
external data is forbidden.

---

## 3. Directory map

```
MaatriSetu/
├── docs/                     Specification and reference. No application code.
│   ├── PRD.md                Product vision (original).
│   ├── development-foundation.md  Corrected data model & workflow decisions.
│   ├── architecture.md       This file.
│   ├── stitch-setup.md       Design-tool access notes.
│   └── prototype/            Stitch HTML export — visual reference, never imported.
│
├── supabase/
│   ├── migrations/           Forward-only, numbered, immutable once merged.
│   ├── seed.sql              Synthetic demo data. Never real patient data.
│   └── config.toml           Local stack configuration.
│
├── src/
│   ├── app/                  Next.js App Router. Thin (see ARCH-1).
│   │   ├── (clinic)/         Authenticated staff area, clinic-scoped.
│   │   ├── referral/[token]/ PUBLIC tokenized handover page. No session.
│   │   ├── api/              Route handlers + webhooks.
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── modules/              Domain logic. One folder per bounded concept.
│   │   ├── patients/         Identity, demographics, contacts.
│   │   ├── pregnancies/      Episodes, dating, obstetric history.
│   │   ├── visits/           Encounters, drafts, the atomic save.
│   │   ├── reports/          Uploads, extraction, candidates, observations.
│   │   ├── referrals/        Draft, issued snapshot, access tokens.
│   │   ├── voice/            Audio intake, transcription, triage tags.
│   │   └── audit/            Append-only event recording.
│   │
│   ├── core/                 Cross-cutting. No domain knowledge (see ARCH-3).
│   │   ├── auth/             Session, membership resolution, permission matrix.
│   │   ├── db/               Supabase clients (browser / server / service-role).
│   │   ├── errors/           AppError taxonomy and HTTP mapping.
│   │   ├── obstetrics/       Pure clinical arithmetic. Heavily unit-tested.
│   │   ├── idempotency/      Request-key handling for safe retries.
│   │   └── config/           Validated environment variables.
│   │
│   ├── components/
│   │   ├── ui/               Generic primitives. No clinical vocabulary.
│   │   └── cockpit/          The consultation screen's composed parts.
│   │
│   └── lib/                  Genuinely trivial helpers (cn, formatters).
│
├── worker/                   Separate Node process. Not a Next.js route.
│   └── src/jobs/             OCR, speech-to-text, outbox delivery.
│
└── tests/
    ├── unit/                 Pure functions. Fast, no I/O.
    └── integration/          Against the local Supabase stack.
```

### Rule ARCH-7 — long-running work does not run in a request

OCR and speech-to-text are queued and executed by `worker/`. A route handler may
enqueue a job; it may not await a model call. The request returns immediately and
the UI observes state changes.

### Rule ARCH-8 — the worker shares core, not app

`worker/` imports from `src/core/**` and `src/modules/**`. It never imports from
`src/app/**`. The worker carries explicit tenant context and **cannot verify
observations** — verification is a clinician act.

---

## 4. Naming conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Directories | `kebab-case` | `src/modules/voice-queries` |
| React components | `PascalCase.tsx` | `HeaderBanner.tsx` |
| Non-component modules | `kebab-case.ts` with role suffix | `visit.service.ts` |
| Database tables | `snake_case`, plural | `report_uploads` |
| Database enums | `snake_case` type, `SCREAMING_SNAKE` values | `review_status` / `STAGED` |
| Migrations | `NNNN_short_description.sql` | `0003_patients_pregnancies.sql` |
| Zod schemas | `<Thing>Schema` | `CreatePatientSchema` |
| Types | `PascalCase`, no `I` prefix | `PatientSummary` |

### Rule ARCH-9 — units live next to values

Any stored or transported clinical measurement carries its unit. A bare number
crossing a boundary is a defect. Applies to database columns, zod schemas,
domain types and OCR output alike.

### Rule ARCH-10 — "unknown" is a value, not an absence

Allergy status, blood group, dates and doses distinguish *not recorded* from
*none*. Never render an empty column as a negative clinical finding. This matters
most on the referral snapshot, which is read under stress at 2 AM.

---

## 5. What does not belong in this repository

- Real patient data, in seeds, fixtures, tests or screenshots.
- Secrets. `.env.example` lists names; values stay out of git.
- Generated design exports treated as source — `docs/prototype/` is read by humans, never imported.
