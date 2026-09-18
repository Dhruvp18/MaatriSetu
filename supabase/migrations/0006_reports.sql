-- ---------------------------------------------------------------------------
-- 0006 — Report ingestion: uploads, extraction, candidates, observations
-- ---------------------------------------------------------------------------
-- PRD §7 decision 2 is right: separate the immutable ingestion tier from the
-- clinician-curated record. This migration implements that as four stages, so
-- that "review before commit" is a property of the schema rather than a rule
-- the application is trusted to remember:
--
--   report_uploads    the photograph. Immutable. Never carries clinical meaning.
--        |
--   extraction_runs   one attempt by a model. A retry is a new run, not an edit.
--        |
--   report_candidates proposed values. An assistant may correct these.
--        |            Correction is NOT verification.
--        v
--   observations      verified clinical facts. Only a clinician creates these,
--                     only inside the atomic visit save.
--
-- Two further departures from PRD §8:
--
--   * Every value carries its unit, original and normalized (ARCH-9). A
--     unitless `{hb: 8.6}` cannot be safely trended or rendered: haemoglobin
--     reported in g/L and in g/dL differ by a factor of ten.
--   * `is_abnormal` is not derived. PRD §3 forbids the system from classifying
--     findings. What the schema stores instead is the reference range printed
--     on the slip (a transcribed fact) and, separately, a clinician's own flag.
-- ---------------------------------------------------------------------------

create type upload_assignment_status as enum (
  'ASSIGNED',     -- confidently attached to a pregnancy
  'UNASSIGNED',   -- in the inbox, awaiting attachment
  'QUARANTINED'   -- suspected wrong patient; excluded from all clinical views
);

create type extraction_status as enum (
  'QUEUED', 'PROCESSING', 'NEEDS_CORRECTION', 'READY_FOR_REVIEW', 'FAILED'
);

create type report_type as enum (
  'CBC', 'OGTT', 'SEROLOGY', 'URINE', 'BLOOD_GROUP', 'THYROID',
  'LFT', 'RFT', 'HPLC', 'ULTRASOUND', 'OTHER', 'UNRECOGNISED'
);

create type observation_category as enum (
  'HEMATOLOGY', 'BIOCHEMISTRY', 'SEROLOGY', 'URINE', 'ENDOCRINE', 'OTHER'
);

create type review_decision as enum ('ACCEPTED', 'REJECTED');

-- ---------------------------------------------------------------------------
-- report_uploads
-- ---------------------------------------------------------------------------

create table report_uploads (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  -- Null while the upload sits in the inbox. An upload with no pregnancy can
  -- never contribute to verified history.
  pregnancy_id uuid,
  -- Set when the upload is pulled into a specific consultation.
  visit_id     uuid,

  -- Private object key in Supabase Storage. NOT a public URL: a permanent
  -- public link to a patient's lab slip is an unauthenticated data leak.
  object_key   text not null unique check (length(btrim(object_key)) > 0),
  content_type text not null,
  byte_size    integer not null check (byte_size > 0),
  -- Content hash: detects a duplicate photograph of the same slip, and proves
  -- the stored image was never altered.
  sha256       bytea not null,

  assignment_status upload_assignment_status not null default 'UNASSIGNED',
  quarantine_reason text,

  uploaded_by uuid references staff_users (id),
  uploaded_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint report_uploads_pkey primary key (id),
  constraint report_uploads_tenant_key unique (clinic_id, id),
  constraint report_uploads_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint report_uploads_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint report_uploads_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,

  constraint report_uploads_assignment_consistent
    check (
      (assignment_status = 'ASSIGNED'    and pregnancy_id is not null) or
      (assignment_status = 'UNASSIGNED'  and pregnancy_id is null) or
      (assignment_status = 'QUARANTINED')
    ),
  constraint report_uploads_quarantine_has_reason
    check (assignment_status <> 'QUARANTINED' or quarantine_reason is not null)
);

create index report_uploads_inbox_idx
  on report_uploads (clinic_id, uploaded_at desc) where assignment_status = 'UNASSIGNED';
create index report_uploads_pregnancy_idx on report_uploads (pregnancy_id, uploaded_at desc);

-- The stored image itself is immutable; only its assignment may change.
create or replace function app.guard_upload_immutability()
returns trigger
language plpgsql
as $$
begin
  -- The document itself never changes, under any circumstances.
  if new.object_key is distinct from old.object_key
     or new.sha256 is distinct from old.sha256 then
    raise exception
      'report_uploads: the stored document is immutable.'
      using errcode = 'restrict_violation';
  end if;

  -- The patient link may change in exactly one situation: a wrong-patient slip
  -- that has been quarantined is being reassigned through the audited path.
  -- Parenthesised and stated separately rather than relying on AND/OR
  -- precedence, because getting this backwards would silently permit moving a
  -- live report between patients.
  if new.patient_id is distinct from old.patient_id
     and old.assignment_status <> 'QUARANTINED' then
    raise exception
      'report_uploads: reassigning a report to another patient requires quarantining it first. Use the audited reassignment path.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger report_uploads_immutable
  before update on report_uploads
  for each row execute function app.guard_upload_immutability();

create trigger touch_report_uploads
  before update on report_uploads
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- extraction_runs
-- ---------------------------------------------------------------------------
-- One attempt by one model at one prompt version. Kept forever: when a value
-- is later disputed, the question "what did the model actually return, and
-- which prompt produced it" must be answerable.

create table extraction_runs (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  upload_id uuid not null,

  provider       text not null,              -- 'fixture' | 'anthropic' | 'google'
  model          text not null,
  prompt_version text not null,

  status      extraction_status not null default 'QUEUED',
  attempt_no  integer not null default 1 check (attempt_no >= 1),

  -- Verbatim provider response. Untrusted input: parsed with zod before any
  -- use, never cast (ARCH-6).
  raw_output jsonb,
  detected_report_type report_type,

  error_code    text,
  error_message text,

  started_at   timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint extraction_runs_upload_fk
    foreign key (clinic_id, upload_id) references report_uploads (clinic_id, id) on delete restrict,
  -- Required so report_candidates can reference this table with a composite,
  -- tenant-aware foreign key.
  constraint extraction_runs_tenant_key unique (clinic_id, id),
  constraint extraction_runs_attempt_unique unique (upload_id, attempt_no),
  constraint extraction_runs_failure_explained
    check (status <> 'FAILED' or error_code is not null)
);

create index extraction_runs_upload_idx on extraction_runs (upload_id, attempt_no desc);

create trigger touch_extraction_runs
  before update on extraction_runs
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- report_candidates
-- ---------------------------------------------------------------------------
-- Proposed values awaiting clinician verification. An assistant correcting a
-- misread digit increments correction_version; it does not make the value true.

create table report_candidates (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  extraction_run_id uuid not null,

  -- Canonical test code (application-owned vocabulary, e.g. 'hb', 'platelets',
  -- 'ogtt_fasting'). Trend series are keyed on this.
  test_code text not null check (length(btrim(test_code)) > 0),
  -- The label as printed on the slip, kept verbatim so a clinician can see what
  -- the mapping was derived from.
  printed_label text,

  value_numeric numeric,
  value_text    text,
  -- Unit exactly as printed, plus the application's normalized unit. Both are
  -- required when a numeric value is present (ARCH-9).
  unit_original   text,
  unit_normalized text,
  value_normalized numeric,

  -- Reference interval printed on the slip. A transcribed fact, not a judgment.
  reference_low  numeric,
  reference_high numeric,
  reference_text text,

  observed_date  date,
  observed_date_precision date_precision not null default 'UNKNOWN',

  -- Provider confidence, 0..1. Displayed to the human, never used to
  -- auto-accept a value.
  confidence numeric(4,3) check (confidence between 0 and 1),
  source_page integer,

  correction_version integer not null default 0 check (correction_version >= 0),
  corrected_by uuid references staff_users (id),
  corrected_at timestamptz,

  -- An assistant may discard an obviously spurious row before review.
  discarded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint report_candidates_run_fk
    foreign key (clinic_id, extraction_run_id) references extraction_runs (clinic_id, id) on delete cascade,
  constraint report_candidates_has_a_value
    check (value_numeric is not null or value_text is not null),
  constraint report_candidates_numeric_has_units
    check (value_numeric is null or (unit_original is not null and unit_normalized is not null))
);

create index report_candidates_run_idx on report_candidates (extraction_run_id) where discarded_at is null;

create trigger touch_report_candidates
  before update on report_candidates
  for each row execute function app.touch_row();

comment on table report_candidates is
  'Proposed, unverified values. Assistant correction records a version; it is not verification. Only a clinician creates an observation.';

-- Needed for the composite FK from observations.
alter table report_candidates add constraint report_candidates_tenant_key unique (clinic_id, id);

-- ---------------------------------------------------------------------------
-- report_reviews
-- ---------------------------------------------------------------------------
-- The clinician's decision on a whole upload, recorded once per review.
-- An accepted report may produce zero pins: a normal result is still part of
-- the verified history and still available to trends and referral prefill.

create table report_reviews (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  upload_id uuid not null,
  visit_id  uuid,

  decision  review_decision not null,
  reason    text,
  -- Which candidate state was reviewed, so a later correction is detectable.
  reviewed_candidate_versions jsonb not null default '{}'::jsonb,

  reviewed_by uuid not null references staff_users (id),
  reviewed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint report_reviews_upload_fk
    foreign key (clinic_id, upload_id) references report_uploads (clinic_id, id) on delete restrict,
  constraint report_reviews_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  constraint report_reviews_rejection_explained
    check (decision <> 'REJECTED' or reason is not null)
);

create index report_reviews_upload_idx on report_reviews (upload_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- observations
-- ---------------------------------------------------------------------------
-- Verified clinical facts. This is the table trends read from — NOT the pin
-- table. Pinning is a display preference; if the Hb sparkline drew only from
-- pinned rows, an unpinned normal value would vanish and the trend would show
-- a steeper fall than actually occurred.

create table observations (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,

  category  observation_category not null,
  test_code text not null check (length(btrim(test_code)) > 0),
  test_name text not null,

  value_numeric   numeric,
  value_text      text,
  unit_original   text,
  unit_normalized text,
  value_normalized numeric,

  reference_low  numeric,
  reference_high numeric,
  reference_text text,

  observed_date  date not null,
  observed_date_precision date_precision not null default 'DAY',

  -- Provenance. Either extracted-then-verified, or entered directly.
  source              data_source not null,
  source_upload_id    uuid,
  source_candidate_id uuid,

  -- Clinician's own flag. Deliberately nullable and deliberately not derived
  -- from the reference range: the system does not classify findings (PRD §3).
  flagged_by_clinician boolean,
  clinician_note       text,

  -- Verification is the act that creates this row, so it is mandatory.
  verified_by uuid not null references staff_users (id),
  verified_at timestamptz not null default now(),

  -- Corrections supersede. History is never overwritten.
  supersedes_id uuid,
  superseded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint observations_pkey primary key (id),
  constraint observations_tenant_key unique (clinic_id, id),
  constraint observations_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint observations_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint observations_upload_fk
    foreign key (clinic_id, source_upload_id) references report_uploads (clinic_id, id) on delete restrict,
  constraint observations_candidate_fk
    foreign key (clinic_id, source_candidate_id) references report_candidates (clinic_id, id) on delete restrict,
  constraint observations_supersedes_fk
    foreign key (clinic_id, supersedes_id) references observations (clinic_id, id) on delete restrict,

  constraint observations_has_a_value
    check (value_numeric is not null or value_text is not null),
  constraint observations_numeric_has_units
    check (value_numeric is null or (unit_original is not null and unit_normalized is not null)),
  -- An extracted value must be able to point back at the document it came from.
  constraint observations_extracted_has_provenance
    check (source <> 'EXTRACTED_VERIFIED' or source_upload_id is not null)
);

-- Trend queries: current (non-superseded) values for one series, in date order.
create index observations_series_idx
  on observations (pregnancy_id, test_code, observed_date)
  where superseded_at is null;

create index observations_pregnancy_idx
  on observations (pregnancy_id, observed_date desc) where superseded_at is null;

create trigger touch_observations
  before update on observations
  for each row execute function app.touch_row();

comment on table observations is
  'Verified clinical facts. Trends and referral prefill read from here, filtered on superseded_at is null — never from finding_pins.';

comment on column observations.flagged_by_clinician is
  'Clinician-entered. NULL means no clinician has flagged it, which is not the same as normal.';

-- ---------------------------------------------------------------------------
-- finding_pins
-- ---------------------------------------------------------------------------
-- Purely a display preference: what the clinician wants surfaced on the cockpit
-- for this pregnancy. Unpinning hides a row; it does not unverify a fact.

create table finding_pins (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  pregnancy_id uuid not null,

  observation_id  uuid,
  scan_report_id  uuid,   -- FK added in 0007, once scan_reports exists

  pinned_by uuid not null references staff_users (id),
  pinned_at timestamptz not null default now(),
  unpinned_by uuid references staff_users (id),
  unpinned_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint finding_pins_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint finding_pins_observation_fk
    foreign key (clinic_id, observation_id) references observations (clinic_id, id) on delete restrict,
  -- Exactly one target.
  constraint finding_pins_single_target
    check ((observation_id is not null)::int + (scan_report_id is not null)::int = 1)
);

create unique index finding_pins_unique_active_observation_idx
  on finding_pins (observation_id) where unpinned_at is null and observation_id is not null;

create index finding_pins_pregnancy_idx
  on finding_pins (pregnancy_id) where unpinned_at is null;

create trigger touch_finding_pins
  before update on finding_pins
  for each row execute function app.touch_row();

comment on table finding_pins is
  'Display preference only. Never a filter for trends, history or referral prefill.';
