-- ---------------------------------------------------------------------------
-- 0009 — Patient voice queries and keyword routing
-- ---------------------------------------------------------------------------
-- Three safety properties are built into this table:
--
--   1. ASSOCIATION IS NOT ASSUMED. `patient_id` is nullable. An inbound message
--      from an unverified or ambiguous number lands with association_status
--      UNMATCHED or AMBIGUOUS and goes to a staffed queue. It never attaches
--      clinical content to a patient record on the strength of a phone number
--      alone — shared handsets make that a wrong-patient event waiting to
--      happen.
--
--   2. THE TRIAGE TAG IS A ROUTING HINT, NOT AN ASSESSMENT. It is produced by a
--      versioned keyword lexicon authored by clinicians and stored in the repo.
--      The matched phrases and the lexicon version are both recorded so any tag
--      can be explained. It is deliberately NOT called a risk level.
--
--   3. PROCESSING FAILURE STAYS VISIBLE. A note whose transcription failed is
--      FAILED. It is never defaulted to "routine", because the failure mode of
--      defaulting is a missed red flag.
--
-- Automated clinical replies are off by default; see MESSAGING_PROVIDER in
-- .env.example and docs/development-foundation.md §4.
-- ---------------------------------------------------------------------------

create type voice_channel as enum ('WHATSAPP', 'IN_APP_UPLOAD', 'OTHER');

create type voice_processing_state as enum (
  'RECEIVED', 'QUEUED', 'TRANSCRIBING', 'TRANSLATING', 'READY', 'FAILED'
);

create type contact_association_status as enum (
  'VERIFIED',   -- came from a verified contact of exactly one patient
  'AMBIGUOUS',  -- the number is a verified contact of more than one patient
  'UNMATCHED'   -- number not recognised, or association never verified
);

-- Routing buckets. Named for what they do (how urgently a human should look),
-- not for what the patient has.
create type query_routing_bucket as enum (
  'INFORMATIONAL',    -- matches a routine informational topic
  'NEEDS_REVIEW',     -- no confident match; a human reads it
  'PRIORITY_REVIEW'   -- matched a clinician-authored urgent phrase
);

create table voice_queries (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete restrict,

  -- Null until association is established and verified.
  patient_id uuid,
  contact_id uuid references patient_contacts (id) on delete set null,
  association_status contact_association_status not null default 'UNMATCHED',
  -- When several patients share the number, the candidates are kept so staff
  -- can choose rather than guess.
  association_candidates jsonb not null default '[]'::jsonb,

  channel voice_channel not null default 'WHATSAPP',
  -- Provider's message id. Unique, so a webhook redelivery is a no-op rather
  -- than a duplicate entry in the clinician's queue.
  provider_message_id text unique,
  from_phone_e164 text,

  -- Private object key. Audio is write-once.
  audio_object_key text,
  audio_duration_seconds integer check (audio_duration_seconds >= 0),
  audio_mime_type text,

  processing_state voice_processing_state not null default 'RECEIVED',
  processing_error text,

  detected_language text,                 -- BCP-47: 'mr', 'hi', 'gu', 'en'
  transcript_original text,
  translation_en      text,
  -- Provider self-reported confidence, shown to the reader as uncertainty.
  transcription_confidence numeric(4,3) check (transcription_confidence between 0 and 1),
  transcript_provider text,
  transcript_model    text,

  -- Routing (see header).
  routing_bucket  query_routing_bucket,
  matched_phrases text[] not null default '{}',
  lexicon_version text,

  -- A clinician has seen it.
  acknowledged_by uuid references staff_users (id),
  acknowledged_at timestamptz,
  -- Addressed during a specific consultation, committed by that visit's save.
  resolved_in_visit_id uuid,
  resolution_note text,
  resolved_at timestamptz,

  received_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1,

  constraint voice_queries_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint voice_queries_visit_fk
    foreign key (clinic_id, resolved_in_visit_id) references visits (clinic_id, id) on delete restrict,

  -- A verified association must actually name a patient.
  constraint voice_queries_verified_has_patient
    check (association_status <> 'VERIFIED' or patient_id is not null),
  -- A failure must say why; it must never be silently routed as informational.
  constraint voice_queries_failure_explained
    check (processing_state <> 'FAILED' or processing_error is not null),
  constraint voice_queries_failure_not_bucketed
    check (processing_state <> 'FAILED' or routing_bucket is null)
);

-- The clinician's drawer: unresolved items for one patient.
create index voice_queries_unresolved_idx
  on voice_queries (patient_id, received_at desc) where resolved_at is null;

-- The staffed association queue.
create index voice_queries_association_queue_idx
  on voice_queries (clinic_id, received_at desc)
  where association_status <> 'VERIFIED';

-- The clinic dashboard's attention list.
create index voice_queries_priority_idx
  on voice_queries (clinic_id, received_at desc)
  where routing_bucket = 'PRIORITY_REVIEW' and acknowledged_at is null;

create trigger touch_voice_queries
  before update on voice_queries
  for each row execute function app.touch_row();

comment on column voice_queries.routing_bucket is
  'How urgently a human should read this. A keyword routing hint from a versioned clinician-authored lexicon — not a triage level, not a risk score, not a clinical assessment.';

comment on column voice_queries.association_candidates is
  'Populated when a number is a verified contact of more than one patient. Staff choose; the system never guesses.';
