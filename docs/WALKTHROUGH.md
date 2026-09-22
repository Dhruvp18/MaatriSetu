# MaatriSetu — complete walkthrough

An assistive paper-to-digital consultation cockpit for high-volume Indian
antenatal OPDs. A QR sticker on the mother's existing paper file loads her
verified obstetric history onto one screen, so the OB-GYN spends the two-minute
consultation on the patient rather than the paperwork.

Built for Health-a-thon 2026 (IIT Bombay KCDH · Koita Foundation · FOGSI ·
Sarvam AI).

> **MaatriSetu does not diagnose.** It organises and surfaces records that
> already exist. It never scores risk, never labels a finding abnormal, never
> recommends a dose, and never gives a patient clinical advice. Every clinical
> judgment stays with the clinician, and nothing enters the permanent record
> without a clinician's explicit verification.

> **Status: working prototype on production-grade foundations.** Synthetic data
> only. Not cleared for real patient data — see [Release gates](#release-gates).

---

## Contents

1. [The problem, and the shape of the answer](#1-the-problem-and-the-shape-of-the-answer)
2. [Running it](#2-running-it)
3. [The demo walkthrough](#3-the-demo-walkthrough)
4. [Feature inventory](#4-feature-inventory)
5. [How it is built](#5-how-it-is-built)
6. [The safety rules, and why each exists](#6-the-safety-rules-and-why-each-exists)
7. [Verification](#7-verification)
8. [What is not built](#8-what-is-not-built)
9. [Release gates](#9-release-gates)

---

## 1. The problem, and the shape of the answer

Three failures dominate maternal care in municipal tertiary hospitals and busy
nursing homes:

| Problem | What it costs |
| --- | --- |
| **OPD paper bottleneck** | 80–120 antenatal patients per 3-hour shift. Up to 40% of consult time lost flipping through crinkled files for baseline Hb, OGTT, TIFFA clearance or an LSCS indication. |
| **Broken emergency continuity** | 2 AM referrals arrive with illegible notes and no serology, blood group or placental localisation. Magnesium sulphate loading doses get repeated — a toxicity risk. |
| **Disorganised patient communication** | Low-literacy mothers call repeatedly; danger signs get reported late or missed. |

Conventional EMRs fail here because they demand full digitisation and
doctor-driven data entry — unworkable at two minutes per patient.

**MaatriSetu keeps the paper file as the source artefact and layers digital
retrieval on top.** The mother's folder keeps a 1×1 inch QR sticker. Scanning it
opens her whole record. Staff never retype what a document already says.

---

## 2. Running it

### Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | ≥ 22.13 |
| pnpm | ≥ 11 (`corepack enable pnpm`) |
| Docker | only for `pnpm verify:schema` |
| psql | only for applying migrations |

### First run

```bash
pnpm install
cp .env.example .env.local     # then fill in, see below
pnpm dev
```

The app serves at <http://localhost:3000>. **Read the port it prints** — a stale
process often holds 3000 and Next silently moves to 3001.

### The database is hosted, not local

Development runs against a hosted Supabase project in **`ap-south-1` (Mumbai)**,
chosen so patient data stays in India under the DPDP Act. All 22 migrations are
already applied there.

`supabase start` does **not** work on the current dev machine — Docker is
healthy but the large image pulls fail. So `pnpm db:start`, `pnpm db:reset` and
`pnpm db:types` are inert. Migrations are applied with `psql`, and types are
regenerated through the Supabase MCP connector.

### Environment

Two values must be pasted by hand from the Supabase dashboard:

| Variable | Where |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → `service_role` → Reveal |
| `DATABASE_URL` | Settings → Database → **Session pooler** URI |

> `DATABASE_URL`'s password contains `@`, percent-encoded as `%40`. Do not
> "tidy" it — libpq stops parsing userinfo at a literal `@`.

Providers each default to a **labelled fixture**, so the demo works with no keys
at all and canned output can never pass as real:

```bash
SPEECH_PROVIDER="sarvam"        # or "fixture"
SARVAM_API_KEY="…"

OCR_PROVIDER="anthropic"        # or "fixture"
ANTHROPIC_API_KEY="…"

MESSAGING_PROVIDER="disabled"   # automated clinical replies stay off
```

Selecting a provider without its key is a **startup error**, not a silent
fallback — falling back would put canned values on screen under a label claiming
something real had been read.

### The background worker

Transcription and extraction are model calls that take tens of seconds. Running
them inside a request would hold a connection open while a nurse waits at a
counter, so they run in a separate process:

```bash
pnpm worker:dev
```

### Sign-ins (synthetic)

| Email | Role |
| --- | --- |
| `doctor@maatrisetu.local` | Doctor |
| `nurse@maatrisetu.local` | Nurse |
| `assistant@maatrisetu.local` | Assistant |
| `admin@maatrisetu.local` | Admin |

Password for all four: `maatrisetu`

### Everyday commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm worker:dev` | Background worker (voice, extraction) |
| `pnpm typecheck` | `next typegen` then `tsc --noEmit` |
| `pnpm lint` | ESLint, including the architecture import rules |
| `pnpm test` | 239 unit tests |
| `pnpm verify:schema` | Every migration + seed + 63 invariants on a throwaway Postgres |
| `node tools/check-pages.mjs [url]` | 90 checks on rendered authenticated screens |
| `node tools/check-session.mjs` | All four roles resolve to an actor |
| `node tools/smoke-live.mjs` | Live end-to-end write path |
| `node tools/check-voice.mjs` | Live Sarvam round trip |

---

## 3. The demo walkthrough

Three seeded patients exist. Each exists to demonstrate something specific.

| Patient | UHID | What she demonstrates |
| --- | --- | --- |
| **Sunita Devi** | MH-2026-89412 | The full case: Rh-negative, penicillin allergy, previous LSCS, falling Hb trend, three milestone scans, a Marathi voice note |
| **Rehana Shaikh** | MH-2026-90155 | Dated from a **scan**, not an LMP — she never recalled one |
| **Lakshmi Yadav** | MH-2026-90211 | **No dating anchor at all**, and allergies never asked |

### Step 1 — Sign in

`/sign-in` as `doctor@maatrisetu.local`. The clinic home lists only the
workflows your role actually holds, derived from the same permission matrix the
server enforces — so no button leads to a refusal.

Sign in as the **assistant** to see the contrast: she gets patient search and
report upload, and nothing else.

### Step 2 — Register a patient

`/clinic/patients/new`. Shaped for the under-sixty-seconds criterion: one
column, tab order matching the order questions are asked, and only the fields
that cannot be filled in later.

Three things to notice, because each is a deliberate safety decision:

- **Age defaults to a stated estimate**, not a date of birth. Most mothers state
  an age. It records *the day it was stated*, which is what keeps it
  interpretable eight months later.
- **Allergies are three-valued**: "Not asked yet" / "Asked — none known" /
  "Asked — has allergies". The default is *not asked*.
- **Blood group defaults to "Not recorded"** — a real state, not a blank.

### Step 3 — Open a pregnancy

From her record → **Open a pregnancy**. The dating question comes first because
everything downstream hangs off it.

Try all three options:

- **LMP** — a date she recalls, with how sure she is
- **Dating scan** — asks for gestation the way a report states it (`12w + 3d`)
  and converts, rather than making a nurse compute 87 days
- **Not established yet** — a real choice, not a way of skipping the question

### Step 4 — Issue and print the file sticker

Her record → **File sticker** → *Issue file sticker*.

The QR encodes an **opaque random token and nothing else** — no name, no UHID,
no patient id. A sticker photographed across a waiting room reveals nothing, and
it only resolves for an authenticated user of this clinic.

The raw token exists exactly once, in the response that mints it. Only its
SHA-256 hash is stored, so **print it now** — a lost sticker is reissued, never
recovered. Printing isolates the 25 mm square so you don't burn a sheet per
patient.

### Step 5 — Scan it

`/clinic/scan`. The field stays focused and re-focuses after stray clicks,
because a scan that lands on the page instead of the field does nothing and the
doctor has no way to tell why. A barcode scanner types the code and submits; you
can also type it by hand.

The token travels by **POST, never a query parameter** — `?token=…` would put a
working key to a patient's record into browser history and every proxy log
between here and the server.

### Step 6 — Record vitals

Her record → **Today's visit** → *Start today's visit* → record vitals.

Record a blood pressure, then record a **second** reading. The recheck appears
*beside* the first, not over it — overwriting would destroy the comparison the
recheck was performed to make. Every field prints its unit; "not tested" is
distinct from a nil dipstick result.

### Step 7 — The cockpit

Her record → **Open cockpit**. One screen, a persistent banner and six
accordions.

**On the banner:** GPLA badge, gestation computed live, Rh-negative and allergy
pills. Fetal presentation is deliberately **absent** — it changes before term,
and a stale "breech" pinned to the top of every screen for six weeks invites a
decision nobody re-checked. It appears with the scan that observed it, dated.

**The haemoglobin trend reads `11.2 → 9.8 → 8.6 g/dL`.** Only the *latest* value
is pinned. If the sparkline drew from pins it would show one point, the fall
would be invisible, and the screen would look entirely reasonable while hiding
the finding. This is why `observations` and `finding_pins` are separate tables.

**Open Lakshmi's cockpit** for the contrast: "Dating not established", no
gestation, no due date, "Allergies not recorded". Nothing is invented.

### Step 8 — Her voice messages

Above the record, if she has sent any. **Her own words appear above the
translation, in the larger type.**

That ordering is asserted by a test, for a concrete reason. On this pipeline's
first real run, Sarvam rendered:

> **मला खूप डोकेदुखी आहे आणि डोळ्यांपुढे अंधारी येते**
> *"I have a severe headache and I feel sleepy."*

"डोळ्यांपुढे अंधारी येते" means **vision darkening** — a cardinal pre-eclampsia
warning. It came back as "sleepy". A clinician reading only the English would
have missed it.

The message was still routed **read-first**, because the keyword lexicon matches
her original words as well as the translation and hit `अंधारी`.

To generate one live:

```bash
pnpm worker:dev            # in one terminal
node tools/check-voice.mjs # in another
```

It synthesises a Marathi danger-sign phrase with Sarvam's own TTS, stores it as
the app would, and waits for the worker — exercising storage, the queue, STT in
both transcribe and translate modes, the routing lexicon and the audit trail.

### Step 9 — Save & Next

The sixth accordion. Write an impression, add a drug, tick advice, set a
follow-up, choose what to surface, tick which messages you answered — then
**Save & next patient**, which lands you back at the scanner for the next file.

Everything commits in **one transaction**. Orders with no impression read as a
prescription nobody reasoned about; an impression with no orders reads as a
decision never acted on.

Double-click the button. Nothing duplicates: the idempotency key is minted once
per form and reused for every retry.

### Step 10 — The visit slip

From the cockpit's earlier-visits list → **print slip** on any saved visit. The
A5/A4 sheet the mother takes home.

The gestation is the one **frozen at save**, and the due date is reconstructed
from it — so the two numbers on the paper agree with each other and a later
redating cannot move either. Colour is flattened to black: on screen colour
carries meaning, and none of it survives a mono laser.

### Step 11 — Emergency referral

Her record → **Referral**. Draft it, then issue it.

Issuing **freezes** the document. The print view and the public page render from
the same frozen snapshot, so they can never disagree. A clinical correction
issues a *new* referral that supersedes the old one — it never edits the
document travelling with the patient.

The share link carries an opaque token whose hash alone is stored, expires, and
can be revoked. Open `/referral/<token>` in a private window: no session, no
indexing, no caching. Expired, revoked and unknown tokens all return the same
thing.

**Pre-referral doses come from what was *given*, with mandatory timestamps —
never from what was *ordered*.** That distinction is the entire clinical point:
it is what stops a receiving unit re-loading magnesium sulphate at 2 AM.

---

## 4. Feature inventory

### Fully working, verified end to end

| # | Feature | Where |
| --- | --- | --- |
| F1 | Patient registration | `/clinic/patients/new` |
| F2 | QR sticker issue, print, scan | `/clinic/patients/[id]`, `/clinic/scan` |
| — | Patient search (also the sticker-lost fallback) | `/clinic/patients` |
| — | Pregnancy episodes: dating, redating, GPLA | `/clinic/patients/[id]/pregnancy/new` |
| — | Visits and serial vitals | `/clinic/patients/[id]/visit` |
| F3 | Persistent header banner | cockpit |
| F5 | Six-accordion cockpit | `/clinic/patients/[id]/cockpit` |
| F6 | Fresh orders, advice, atomic Save & Next | cockpit |
| F7 | Serial lab sparklines | cockpit |
| F8 | MCP visit slip print | `/clinic/visits/[visitId]/slip` |
| F12 | Voice intake + Sarvam transcription + translation | worker |
| F13 | Keyword routing (rule-based, explainable) | worker |
| F14 | Patient queries panel | cockpit |
| F15 | Emergency referral + tokenised public page | `/clinic/patients/[id]/referral`, `/referral/[token]` |
| — | Authentication, roles, RLS, audit | throughout |

### Built at the data layer, no UI yet

| # | Feature | State |
| --- | --- | --- |
| F9 | Slip photo upload | Routine + storage exist; no upload screen |
| F10 | Multimodal OCR parse | Claude vision provider + fixture, both working; not wired to a screen |
| F11 | Review-before-commit | Verification is inside Save & Next and invariant-tested; no review screen |

### Not started

| # | Feature | Note |
| --- | --- | --- |
| F16 | ABHA Scan & Share | ABDM sandbox; manual entry always works |
| — | WhatsApp intake | Deliberately deferred — Meta template approval is slow and the 24-hour session window blocks free-form replies. In-app upload is the working path. |
| — | Visit amendments | `visit_amendments` table exists; no code path |
| — | ABDM FHIR export, offline caching, analytics | PRD P2 |

---

## 5. How it is built

### Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 ·
Supabase (Postgres + Auth + Storage) · Zod 4 · Vitest

### Layering

Dependencies point **downward only**, and both rules are enforced by ESLint:

```
  app/        routing and rendering — thin by rule
    ↓
  modules/    domain logic + authorization — the product lives here
    ↓
  core/       cross-cutting primitives — knows no domain
```

`src/app/**` may not import a repository. `src/modules/**` may not import from
`app/`. The full contract is in [`architecture.md`](architecture.md).

### Module anatomy

Every domain module has the same five files, so any file can be found without
searching:

```
<domain>.types.ts       domain types, no runtime imports
<domain>.schema.ts      zod validation at the boundary
<domain>.mapper.ts      row ↔ domain, no I/O — unit-testable without a database
<domain>.repository.ts  the only place that talks to the database
<domain>.service.ts     authorization + invariants — the module's public API
```

Modules: `patients` · `pregnancies` · `visits` · `reports` · `orders` ·
`voice` · `referrals`

Core: `auth` · `config` · `db` · `errors` · `idempotency` · `obstetrics` ·
`ocr` · `speech` · `storage` · `time` · `tokens`

### Every multi-table write is a SQL routine

The REST client cannot span tables in a transaction. Without these routines a
clinical write with no audit row is reachable — which migration 0012 promises is
not. Each routine persists **and** writes its audit row in one transaction,
makes no authorization decisions, and is revoked from `authenticated`.

### Two database clients, different trust levels

`userClient()` carries the signed-in session, so **RLS applies as an
independent second check**. `serviceClient()` bypasses RLS entirely and is used
only for transactional commits, the public referral page and worker jobs. Which
one is in use, and why, is stated at every call site.

---

## 6. The safety rules, and why each exists

These are not style preferences. Each exists because violating it is a
patient-safety or medico-legal defect.

### 1. Every measurement carries its unit

A haemoglobin of 8.6 means one thing in g/dL and something a factor of ten
different in g/L. A bare number crossing a boundary is a defect. The database
refuses a numeric observation with no unit; a dose is an amount *and* a unit or
neither; a trend whose units change mid-way is dropped rather than drawn,
because 8.6 g/dL and 86 g/L plotted together look like a tenfold rise.

### 2. "Unknown" is a value, not an absence

Modelled as discriminated unions so the distinction cannot be lost:

| Type | Why a nullable field would be wrong |
| --- | --- |
| `AllergyRecord` | "Never asked" must not render as "no allergies" |
| `PregnancyDating` | No anchor must not become an invented gestation |
| `PatientSearchResult` | "You may not see this" ≠ "we never recorded it" |
| `PatientAssociation` | "Nobody" ≠ "we cannot tell which of these two" |
| `Processing` | A failed transcription ≠ an empty message |
| `SessionResolution` | "Not signed in" ≠ "signed in with no membership" |

### 3. Nothing enters the record without clinician verification

Extraction output is a **candidate**. It lives in `report_candidates` and never
appears in a patient's history. Only `save_visit_consultation`, called by a
doctor, turns one into an observation — inside the same transaction as the rest
of the consultation.

An assistant may *correct* a misread digit. Correction is not verification.

### 4. Clinical history is corrected by superseding, never overwriting

Observations supersede. Prescriptions supersede. A saved visit is corrected by
an attributed amendment. An issued referral is corrected by issuing a new one.

### 5. No automatic diagnosis, classification or risk labelling

PRD §3 and the FOGSI rules draw this line, and the schema enforces it. Three
fields from the original design were **removed** for crossing it:
`is_abnormal`, `anti_d_status = 'due'`, and `interval_ok` on a uterine scar.

What the system shows instead is the laboratory's own printed range, as a
transcribed fact, worded as *"lab range 11 – 15, outside"* — never "abnormal".
`flaggedByClinician` is tri-state: `null` means nobody has looked, which is not
a clinician judging it unremarkable.

The voice routing buckets are named for **reader urgency**, not clinical
severity: "Read first", "Needs a clinician", "Routine question".

### 6. Every clinical write is audited, append-only

`audit_events` is append-only by trigger *and* by revoked privilege — a trigger
alone can be dropped. Every pin, order, verification and issue records actor,
time and provenance.

### 7. Synthetic data only

No real patient data in this repository, ever.

---

## 7. Verification

The project is verified by five independent layers. All currently pass.

| Layer | What it proves | Count |
| --- | --- | --- |
| `pnpm test` | Pure logic: dating arithmetic, permission matrix, token handling, trends, triage routing, idempotency fingerprints | 239 tests |
| `pnpm verify:schema` | Every migration + seed + invariants on a throwaway Postgres | 63 checks |
| `node tools/check-pages.mjs` | **Rendered** authenticated screens, per role | 90 checks |
| `node tools/smoke-live.mjs` | Live write path through the real RPCs | 8 steps |
| `node tools/check-voice.mjs` | Live Sarvam round trip, TTS → worker → routing | 16 checks |

### Why the page checks exist

Next server actions are not curl-able and Playwright's Chrome launch times out
on this machine, so authenticated pages kept shipping unverified.
`check-pages.mjs` signs in as each seeded role, encodes the session the way
`@supabase/ssr` expects it in a cookie, and asserts **rendered content** — that
the gestational age is computed, that the undated patient shows none, that an
assistant's results carry no demographics.

### Bugs these checks actually caught

Worth listing, because they are the argument for the checks:

- **A self-referential RLS policy** on `staff_users` that broke *every* sign-in.
  It reached the hosted database because `verify:schema` connects as `postgres`,
  which bypasses RLS. The invariants now assume the `authenticated` role.
- **Five composite foreign keys** using `ON DELETE SET NULL`, which would have
  tried to null a `NOT NULL` tenant column.
- **A missing tenant key** on `extraction_runs`, breaking its composite FK.
- **Missing session-refresh middleware** — clinicians would have been signed out
  mid-consultation.
- **An open redirect** in the sign-in `next` parameter.
- **A hardcoded `Asia/Kolkata`** that would have shifted gestational age by a day
  for any clinic in another zone.
- **A dead `REFERRAL_TOKEN_SECRET`** required at startup and read by nothing.
- **`verify-schema.sh` hiding its own failures** — under `set -e`, a failing
  command substitution aborted before printing the error.

---

## 8. What is not built

Stated plainly, because a demo that implies otherwise is worse than one that
doesn't.

- **OCR has no screens.** The provider, pipeline and verification path exist and
  are tested; nothing in the UI reaches them, and no worker job drives
  extraction.
- **No check invokes a server action over HTTP.** Form-to-service wiring —
  registration, sticker issue, scan, save — is exercised only up to the service
  it calls.
- **The slip and referral screens have no rendered-page coverage.**
- **The triage lexicon is unreviewed.** `LEXICON_VERSION` says so, and a test
  asserts it keeps saying so until a clinician signs it off. Given the
  mistranslation above, this is the highest-value hour anyone can spend here.
- **WhatsApp and ABHA** are not integrated.

---

## 9. Release gates

Before any pilot with real patients:

- [ ] Clinical review of the danger-sign lexicon, and of every field definition
- [ ] Clinical review of the dating rules and the MCP slip layout
- [ ] Provider data-handling approval (Sarvam, Anthropic) for patient audio and images
- [ ] DPDP consent wording in Marathi and Hindi, reviewed by a lawyer
- [ ] Retention and deletion policy
- [ ] Backup and restore exercise
- [ ] Security review, including the public referral page
- [ ] Monitoring, alerting, and a named owner for red-flag escalation
- [ ] Held-out evaluation of OCR and STT on representative Indian slips and audio
- [ ] An incident and correction process
- [ ] Hospital workflow approval and a connectivity fallback

Enabling automated patient messaging additionally needs approved wording, a
staffed escalation owner, and delivery-failure handling. It is off by default
and should stay off until those exist.

---

## Further reading

| Document | Purpose |
| --- | --- |
| [`PRD.md`](PRD.md) | Original product vision. Its schema section is deliberately **not** what was built. |
| [`development-foundation.md`](development-foundation.md) | The corrected data model. Supersedes PRD §8–9. |
| [`architecture.md`](architecture.md) | Layering rules ARCH-1..10, module anatomy, naming |
| [`session-handoff.md`](session-handoff.md) | Current state, gotchas, and what to do next |
| `supabase/migrations/*.sql` | Every non-obvious schema decision, explained in its header |
