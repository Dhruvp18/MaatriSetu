-- ---------------------------------------------------------------------------
-- 0011 — Consent, audit, outbox delivery, idempotency
-- ---------------------------------------------------------------------------
-- PRD §11 commits to DPDP Act 2023 obligations and to an append-only audit log,
-- but PRD §8 contained no table for either. This migration supplies both, plus
-- the two pieces of machinery the atomic-save requirement implies:
--
--   * an OUTBOX, so a failed WhatsApp push or print job can never roll back a
--     saved consultation, and a retry can never double-send;
--   * IDEMPOTENCY records, so a double-clicked Save & Next returns the original
--     result instead of creating a second visit's worth of clinical data.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- consent_records
-- ---------------------------------------------------------------------------
-- Consent is per purpose, and the exact wording shown to the patient is
-- versioned. "She consented" is not defensible; "she consented to purpose X
-- under wording v3 in Marathi, captured verbally by nurse Y on this date" is.

create type consent_purpose as enum (
  'RECORD_KEEPING',        -- storing her clinical record in this system
  'MESSAGING',             -- sending her visit summaries and reminders
  'VOICE_PROCESSING',      -- transcribing and translating her voice notes
  'REFERRAL_SHARING'       -- sharing a handover document with a receiving unit
);

create type consent_method as enum ('VERBAL_WITNESSED', 'WRITTEN_SIGNED', 'DIGITAL_AFFIRMATION');

create table consent_records (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  purpose consent_purpose not null,
  granted boolean not null,

  -- Exactly what she was told, and in which language.
  wording_version text not null,
  language        text not null,          -- BCP-47
  method          consent_method not null,

  captured_by uuid not null references staff_users (id),
  captured_at timestamptz not null default now(),

  withdrawn_at timestamptz,
  withdrawn_by uuid references staff_users (id),
  withdrawal_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint consent_records_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict
);

-- The current consent for a purpose is the latest non-withdrawn row.
create index consent_records_current_idx
  on consent_records (patient_id, purpose, captured_at desc) where withdrawn_at is null;

create trigger touch_consent_records
  before update on consent_records
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------------
-- The medico-legal backbone. Append-only is enforced by trigger AND by revoking
-- UPDATE/DELETE from application roles in 0012 — a trigger alone is bypassable
-- by anyone who can drop it.

create table audit_events (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete restrict,

  -- Exactly one actor kind. A worker acts without a staff user.
  actor_staff_user_id uuid references staff_users (id),
  actor_worker        text,
  actor_description   text,

  -- Correlates every row written by one request.
  request_id text,

  action       text not null check (length(btrim(action)) > 0),  -- 'visit.saved', 'referral.issued'
  entity_table text not null,
  entity_id    uuid,

  -- What changed and why. Contains clinical values by design; access to this
  -- table is restricted accordingly.
  payload jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint audit_events_has_one_actor
    check ((actor_staff_user_id is not null)::int + (actor_worker is not null)::int = 1)
);

create index audit_events_entity_idx on audit_events (entity_table, entity_id, occurred_at desc);
create index audit_events_actor_idx on audit_events (actor_staff_user_id, occurred_at desc);
create index audit_events_request_idx on audit_events (request_id) where request_id is not null;
create index audit_events_clinic_idx on audit_events (clinic_id, occurred_at desc);

create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function app.forbid_mutation();

comment on table audit_events is
  'Append-only. Enforced by trigger and by privilege. Every clinical write records one row inside the same transaction as the write.';

-- ---------------------------------------------------------------------------
-- outbox_events
-- ---------------------------------------------------------------------------
-- Written inside the clinical transaction; delivered afterwards by the worker.
-- This is what makes "printing or message delivery failures never roll back the
-- saved visit" true rather than aspirational.

create type outbox_state as enum ('PENDING', 'IN_FLIGHT', 'DELIVERED', 'FAILED', 'ABANDONED');

create table outbox_events (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete restrict,

  event_type text not null,        -- 'visit.summary.whatsapp', 'referral.share.whatsapp'
  payload    jsonb not null,

  -- Deduplication key. Unique, so a retried transaction cannot enqueue the same
  -- outbound message twice.
  dedupe_key text not null unique,

  state outbox_state not null default 'PENDING',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  next_attempt_at timestamptz not null default now(),

  -- Sanitized. Provider errors may echo message content back; that is not
  -- stored here.
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1
);

create index outbox_events_due_idx
  on outbox_events (next_attempt_at) where state in ('PENDING', 'FAILED');

create trigger touch_outbox_events
  before update on outbox_events
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- delivery_attempts
-- ---------------------------------------------------------------------------
-- One row per attempt. Delivery uncertainty stays visible to staff: "sent" and
-- "we believe it arrived" are different claims, and the UI must not conflate
-- them.

create table delivery_attempts (
  id       uuid primary key default gen_random_uuid(),
  outbox_event_id uuid not null references outbox_events (id) on delete cascade,

  attempt_no integer not null check (attempt_no >= 1),
  provider   text not null,
  -- Provider's own id for the message, used to reconcile status callbacks.
  provider_message_id text,
  -- Provider-reported delivery state, which may never progress past 'sent'.
  provider_status text,

  succeeded  boolean not null,
  error_code text,
  error_message text,

  attempted_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint delivery_attempts_unique unique (outbox_event_id, attempt_no)
);

create index delivery_attempts_event_idx on delivery_attempts (outbox_event_id, attempt_no);
create index delivery_attempts_provider_message_idx
  on delivery_attempts (provider_message_id) where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- idempotency_requests
-- ---------------------------------------------------------------------------
-- At two minutes per patient on hospital wifi, a double-submitted Save & Next
-- is routine. Repeating a request with the same key returns the original
-- result. Reusing a key with a different payload is an error, not a silent
-- overwrite — that would mean one save quietly replaced another.

create table idempotency_requests (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete restrict,
  actor_staff_user_id uuid not null references staff_users (id),

  operation    text not null,            -- 'visit.save_next'
  request_key  text not null,
  -- Hash of the request body, to detect key reuse with different content.
  payload_hash bytea not null,

  completed_at timestamptz,
  -- Where the result lives, so a replay can return it.
  response_entity_table text,
  response_entity_id    uuid,
  response_status       integer,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',

  constraint idempotency_requests_unique unique (clinic_id, actor_staff_user_id, operation, request_key)
);

create index idempotency_requests_expiry_idx on idempotency_requests (expires_at);

comment on table idempotency_requests is
  'Guards clinical commits against duplicate submission. A repeated key with a different payload hash is rejected, never applied.';
