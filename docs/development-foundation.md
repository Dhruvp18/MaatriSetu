# MaatriSetu development foundation

Status: working development specification, 2026-09-18. This addendum resolves the original PRD's implementation conflicts. It does not claim production or clinical readiness. The original PRD remains the product vision; use this document for the implementation decisions below.

## 1. Scope and assumptions

Build a working hackathon prototype with reusable application and database foundations. Calendar estimates remain unset until the deadline and team availability are supplied.

Working defaults, subject to user correction:

- Synthetic patients and synthetic reports only; no real patient processing yet.
- One clinic in the demonstration, tenant isolation in the data model and authorization from the beginning.
- Antenatal care and referral handover; multiple pregnancy episodes supported. Delivery and postpartum workflows deferred.
- Desktop consultation, mobile report upload and referral viewing; online operation. Network failure preserves drafts and offers retry; this is not offline synchronization.
- Core demonstration: registration, pregnancy and visit creation, QR retrieval, report extraction and review, consultation save, printable visit summary, issued referral and mobile QR view.
- Voice transcription is the next increment. Automated patient-facing clinical responses are disabled by default.
- WhatsApp and ABHA are separate optional integration milestones until judging requirements and account availability are known. Fixtures must be visibly labelled and never masquerade as live integrations.

## 2. Architecture decisions

- TypeScript modular monolith: Next.js App Router UI and route handlers; domain services hold authorization and business logic independently of route handlers.
- Use a supported Next.js release, pin actual dependency versions and commit the lockfile when scaffolding. The original Next.js 14 selection is superseded.
- PostgreSQL with Supabase Auth and private Storage. SQL migrations are version-controlled. Browser access is governed by RLS; clinical writes use authorized server operations with transactional database routines where necessary.
- One separately running Node worker for OCR, speech and delivery tasks; PostgreSQL-backed jobs via pg-boss. Confirm hosted database connectivity before provisioning. Request handlers do not run long-lived workers.
- Provider interfaces for OCR, speech, messaging and identity registration. Select a live OCR provider after account/budget confirmation; provider output is untrusted input validated against the application schema.
- Zustand holds unsaved UI state; server data is fetched through a role-specific cockpit contract. Never return prescription data to assistants merely because the doctor cockpit uses a larger payload.
- Saved transactions write an outbox entry for external work. Worker retry cannot create duplicate records or duplicate application-level delivery requests. Provider delivery uncertainty remains visible.
- Private files are addressed by object keys, not permanent public URLs. Original content is not overwritten. Retention and authorized deletion will be defined before a patient pilot rather than promising permanent retention.

## 3. Canonical data model

This is the logical schema contract, not an executable migration. Each mutable entity has UUID id, created_at, updated_at and version. Clinical timestamps use timestamptz; dates use date; numeric values include units. Append-only events and issued snapshots do not follow the mutable-row convention.

| Entity | Required fields and relationships |
| --- | --- |
| clinics | Name, timezone, contact details |
| users | Unique auth subject, display name; no self-assigned role |
| clinic_memberships | Clinic, user, role (doctor/nurse/assistant/admin), active; unique clinic/user |
| patients | Clinic, clinic-scoped UHID, name, DOB or estimated age with recorded date, optional ABHA identifier with verification state, allergy status (unknown/none_known/known), blood group nullable and verification provenance |
| patient_contacts | Clinic, patient, normalized phone, relationship, messaging consent and association verification; phone is not globally unique |
| pregnancies | Clinic, patient, status (active/completed/closed_unknown), nullable LMP, dating certainty, clinician-confirmed EDD, dating source, obstetric history snapshot, outcome and closure fields |
| obstetric_history | Clinic, patient, prior pregnancy/delivery facts, source, reviewer; may link a previously recorded pregnancy |
| visits | Clinic, patient, pregnancy, occurred_at, status (open/saved/cancelled), vitals with recorded_at/by, gestational-age snapshot and dating source at save, impression, clinician, saved_at, version |
| visit_drafts | Visit, author, version, pending orders/review decisions/query resolutions; never a finalized clinical record |
| report_uploads | Clinic, patient, pregnancy nullable pending assignment, visit nullable, immutable object key/hash, uploader, uploaded_at, assignment status |
| extraction_runs | Upload, provider/model/prompt version, raw output, status, error code, attempts, timestamps; reruns create new records |
| report_candidates | Extraction run, source field/page, proposed test code, value, unit, source date, correction version, correcting actor; assistant edits do not verify |
| observations | Clinic, patient, pregnancy, source upload/candidate or manual-entry provenance, test code, numeric/text value, original/normalized units, observed date and date precision, verified_by/at, supersedes_id, clinician-entered abnormal flag |
| finding_pins | Pregnancy, verified observation or verified scan reference, pinned_by/at, unpinned_by/at; display preference, not verification status |
| scan_reports | Clinic, patient, pregnancy, source upload, actual scan date, type, structured measurements/findings, verifier/time, supersedes_id; avoid duplicate scan truth in observations |
| report_reviews | Upload, visit, reviewer/time, decision (accepted/rejected), candidate version; accepted reports may have zero display pins |
| prescriptions | Visit, medicine, dose, unit, route, frequency, food relation optional, duration/start/end, status, author; changes preserve prior prescription history |
| visit_advice | Visit, structured checklist, lab/scan orders, follow-up date; one current row per saved visit revision |
| medication_administrations | Clinic, patient, pregnancy, visit nullable, drug, amount/unit, route, administered_at, recorded_at/by, source certainty; orders are not evidence of administration |
| immunizations | Clinic, patient, pregnancy, vaccine, planned/given/unknown status, administered_at and provenance |
| consent_records | Clinic, patient, purpose, wording version, language, capture method, actor/time, withdrawal event |
| voice_queries | Clinic, verified patient association nullable, provider message id, private audio key, transcript/translation versions, processing state, matched phrase/rule version, acknowledgement and resolution details |
| referrals | Clinic, patient, pregnancy, originating visit optional, status (draft/issued/superseded), immutable issued snapshot, schema version, issuer/time, supersedes_id |
| referral_access_tokens | Referral, token hash, expires_at, revoked_at; raw random token returned only for sharing |
| audit_events | Clinic, actor or worker identity, request id, operation, entity, timestamp and necessary change/provenance data; append-only to application roles |
| outbox / delivery_attempts | Event id, destination reference, deduplication key, state, retry timestamps, sanitized failure and provider receipt |
| idempotency_requests | Clinic, actor, operation, request key, payload hash, completion and response reference |

Constraints before first migration:

- Composite tenant-aware foreign keys prevent references to another clinic's records. Patient/pregnancy/visit consistency is enforced, not merely checked in the UI.
- Unique UHID per clinic; no phone-based automatic merge. ABHA association is explicit and verified before linking identities.
- At most one active pregnancy per patient in a clinic; exceptional records require explicit correction, not silent replacement.
- At most one open OPD visit per pregnancy for the prototype; duplicate requests return the existing visit. Later encounter types may revise this policy.
- RLS on every tenant-owned table and storage bucket; workers retain explicit tenant context and cannot verify observations.
- An observation is corrected by a superseding record, not overwriting clinical history. Trends exclude superseded records and include all relevant verified values, not only pins.
- Unknown results, allergy status, dates and doses remain explicitly unknown. Empty is not equivalent to normal or absent.
- No automatic diagnosis, abnormality classification, Anti-D due determination, or scar-interval interpretation. These labels require clinician input or separately approved future rules.

## 4. State transitions and app flows

### Registration and visit

Search UHID/name/phone -> confirm patient identity -> create patient if needed -> choose/create pregnancy -> capture consent and available baseline information -> create/reuse open visit -> enter vitals -> print patient QR.

The patient QR is an opaque revocable lookup token. It requires authenticated clinic access. Scanning never implicitly issues a referral or starts a second visit. No open visit shows history plus an authorized Start visit action. Ambiguous identity requires selection; shared numbers never merge patients.

### Ingestion and review

Confirm patient/pregnancy -> upload -> queued -> processing -> needs_correction -> ready_for_review -> accepted or rejected.

Processing may enter failed with a retry action; a retry has a new extraction attempt. Unsupported files are rejected before enqueue. Assistant correction records a candidate version. Doctor review accepts selected values into verified observations on Save & Next. Pinning is optional after verification. A normal accepted result remains available to history and referral selection.

Uploads between visits remain in a pregnancy inbox and are explicitly attached to an open consultation. An unassigned report cannot silently enter a pregnancy's verified history. Wrong-patient reports are quarantined; a privileged reassignment records the old/new association and invalidates dependent drafts. Verified wrong-patient data requires an audited amendment.

### Consultation save

Review and pin actions, orders and query resolutions are pending draft changes. No separate pin/resolve endpoint commits them early.

Save request includes visit version, candidate versions, an idempotency key and the draft payload. The server checks role, tenant, patient linkage and versions, locks the visit, and atomically persists accepted observations, pins, orders, impression, query resolutions, audit events, the saved visit snapshot and outbox events.

Version conflict returns 409 with refresh/reconcile guidance. Repeating the same request returns its existing result; reusing a key with different content is rejected. On failure the UI retains its draft. On success it opens the saved summary with Print and Next patient actions. Printing or message delivery failures never roll back the saved visit.

Saved visits are read-only. Corrections create an attributed amendment referencing the original snapshot. Dating changes do not silently recompute the gestational age recorded in old saved visits.

### Referral

Create draft -> prefill latest verified facts with dates -> clinician checks unknown/stale facts -> records transfer findings and actual administered medications -> clinician issues snapshot -> render print/mobile from identical snapshot -> share a separate expiring token.

Six addressed groups: identifiers/facilities, safety parameters, transfer vitals, medication administrations, examination findings, diagnostic summary. Unknown is an allowed explicit state; fabrication is not. Referral creation is independent of Save & Next so an urgent handover does not depend on finishing the consultation.

Expired/revoked tokens reveal no patient details. Replacement tokens do not mutate the snapshot. A clinical correction issues a new referral version. Public referral responses prevent caching/indexing and third-party analytics; tokens are redacted from logs. Access is audited.

### Voice increment

Authenticated upload or verified WhatsApp webhook -> deduplicate message -> establish clinic/contact/patient association -> process audio -> show original transcript, translation and processing uncertainty -> clinician acknowledges/addresses.

Unmatched contacts go to a restricted association queue. The initial demo does not send clinical auto-replies. Matched phrases are labelled for clinician review, never converted into a diagnosis. Processing failure remains visible; it cannot be labelled routine. Any future automated urgency response requires approved wording, rule evaluation, staffed escalation ownership and delivery-failure handling.

## 5. Authorization matrix

| Action | Doctor | Nurse | Assistant | Admin |
| --- | --- | --- | --- | --- |
| Registration / demographics | Yes | Yes | Minimal identity lookup only | No by default |
| Open visit / record vitals | Yes | Yes | No | No |
| Upload / correct report candidates | Yes | Yes | Yes | No |
| Verify observations / save consultation | Yes | No | No | No |
| View prescriptions and full clinical cockpit | Yes | No by default | No | No |
| Issue referral | Yes | No | No | No |
| Manage clinic membership | No unless separately admin | No | No | Yes |

Administration does not imply clinical access. Clinic workflow may explicitly grant a nurse additional read access later. Every endpoint checks both membership and operation permission; hiding controls is insufficient.

## 6. API contract outline

All authenticated operations derive clinic scope from a checked membership. Schemas reject unexpected fields. Consistent errors: unauthenticated, forbidden/not found, validation, conflict, retryable processing failure.

| Route | Behavior |
| --- | --- |
| GET /patients?query=... | Scoped identity search; role-minimized fields |
| POST /patients | Patient registration, idempotent |
| POST /patients/:id/pregnancies | Create pregnancy without overwriting history |
| POST /pregnancies/:id/visits | Create/reuse open visit |
| GET /patients/by-qr/:token | Role-specific bounded cockpit plus active pregnancy/visit identifiers |
| PATCH /visits/:id/draft | Save draft with version check; no clinical finalization |
| POST /visits/:id/save-next | Single clinical commit described above |
| POST /visits/:id/amendments | Attributed correction preserving original |
| POST /pregnancies/:id/uploads | Validate and store private file, enqueue extraction |
| GET /uploads/:id | Authorized status and candidate versions |
| PATCH /uploads/:id/candidates | Versioned correction, no verification |
| POST /uploads/:id/retry | Retry failed extraction idempotently |
| GET /pregnancies/:id/observations | Verified history with units, dates and provenance |
| POST /pregnancies/:id/referrals | Create referral draft |
| POST /referrals/:id/issue | Validate version, snapshot and issue |
| POST /referrals/:id/tokens | Issue replacement access token; doctor only |
| POST /referral-tokens/:id/revoke | Revoke without altering issued record |
| GET /referral/:token | Only immutable public snapshot if token valid |
| GET /visits/:id/print and /referrals/:id/print | Render saved snapshot, no side effects |

Voice webhook signature verification, contact association and delivery-status contracts are specified when enabling that integration. The original independent pin/mark-reviewed/resolve write endpoints are superseded by draft/save semantics.

## 7. Build checkpoints

1. Foundation: schema migration, synthetic seed data, auth, tenant policies, private storage, role checks and audit. Check cross-tenant reads/writes and worker permissions.
2. First vertical slice: registration -> pregnancy -> vitals -> QR -> cockpit -> prescription -> save -> print. Check shared phones, duplicate saves, concurrent edits and cancelled drafts.
3. Reports: upload worker, validated extraction, assistant correction, clinician verification, optional pins and complete verified trends. Check retry, missing units/dates and stale candidate versions.
4. Referral: draft, issued snapshot, print and mobile page. Check unknown fields, subsequent patient edits, expired/revoked tokens and repeat issuance.
5. Voice: real transcription if credentials available; uploaded synthetic audio first. WhatsApp/ABHA remain explicitly separate integrations.
6. Demo rehearsal: seeded reset, scripts for two synthetic pregnancies and one referral, all error states, supported screen sizes and network conditions documented.

UI work uses Stitch after project access. Until then screen inventory: login, patient search/registration, nurse visit/vitals, assistant upload/review, doctor cockpit, saved summary, referral editor, mobile referral, role-specific error/empty states. Allow internal scrolling and mobile layouts; no clipping clinical content to achieve a no-scroll screenshot.

## 8. Acceptance and release gates

Hackathon acceptance: all core journey steps persist real data; unknowns and mock integrations are labelled; authorization tests pass; original source and verifier are visible; repeat saves do not duplicate; print and mobile referral agree; failed OCR/save can recover. Measure QR retrieval at p50/p95 with stated dataset, hardware and network, rather than claiming a universal one-second result.

Before a patient pilot: clinical review of field definitions and dating, provider data-handling approval, consent/retention policy, backup-and-restore exercise, security review, monitoring and alert ownership, representative held-out OCR/STT evaluation, incident/correction process, hospital workflow approval and connectivity fallback. Before broader production: capacity testing, operational support, disaster recovery, migration rollback/forward strategy, accessibility, integration contracts, tenancy and sharing review. These are release gates, not claims already met.

## 9. Open decisions

| Decision | Default / impact |
| --- | --- |
| Hackathon deadline, presentation duration and actual team | Unknown; blocks calendar commitment, not foundational design |
| Judging rules / required integrations | Unknown; may change voice, WhatsApp and ABHA priority |
| Stitch project and screen coverage | Project 2363914982225928169 supplied; authenticated access and screen inventory pending |
| Provider accounts and budget | Unknown; no paid resources provisioned |
| Clinical reviewers and evaluation examples | Unknown; synthetic-only until confirmed |
| Pilot facility and cross-clinic sharing policy | One isolated clinic by default |
| Demo hardware and internet availability | Laptop plus mobile, online assumed |

## References

- Original repository PRD: MaatriSetu — PRD, Implementation Plan & Backend Schema.md.
- Supported framework releases: https://nextjs.org/support-policy
- Stitch access setup: https://stitch.withgoogle.com/docs/mcp/setup
