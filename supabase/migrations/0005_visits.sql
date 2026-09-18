-- ---------------------------------------------------------------------------
-- 0005 — Visits, vitals and consultation drafts
-- ---------------------------------------------------------------------------
-- Two structural changes from PRD §8:
--
--   * A visit belongs to a PREGNANCY, not just to a patient. Without this, a
--     second episode's visits mix into the first episode's history.
--   * Vitals are rows, not columns. A blood-pressure recheck after fifteen
--     minutes is routine antenatal practice, and a single bp_systolic column
--     forces staff to overwrite the first reading — destroying exactly the
--     comparison the recheck was performed to make.
--
-- The draft/commit split is the other half of "Save & Next is atomic". PRD §9
-- exposed independent pin and resolve endpoints, which contradicts it: those
-- writes would land before the save and survive a failed save. Here, every
-- pending decision lives in visit_drafts until one transaction commits them.
-- ---------------------------------------------------------------------------

create type visit_type as enum ('ANC_OPD', 'FOLLOW_UP', 'EMERGENCY', 'OTHER');

create type visit_status as enum ('OPEN', 'SAVED', 'CANCELLED');

-- Point-of-care dipstick grades. Stored as a graded scale, not as free text,
-- because "+" and "1+" and "trace" are otherwise impossible to trend.
create type dipstick_grade as enum ('NIL', 'TRACE', 'ONE_PLUS', 'TWO_PLUS', 'THREE_PLUS', 'FOUR_PLUS');

-- ---------------------------------------------------------------------------
-- visits
-- ---------------------------------------------------------------------------

create table visits (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,

  visit_type   visit_type not null default 'ANC_OPD',
  status       visit_status not null default 'OPEN',
  occurred_at  timestamptz not null default now(),

  -- Gestational age snapshot, frozen at save. If dating is later corrected,
  -- past saved visits keep the GA that was actually used at the time — the
  -- clinician's reasoning that day was based on that number, and rewriting it
  -- would misrepresent the record.
  ga_days_at_visit      integer check (ga_days_at_visit between 0 and 350),
  dating_method_at_visit dating_method,

  -- Accordion 5. Free narrative, authored by the clinician.
  impression text,

  -- The clinician responsible for this consultation.
  clinician_id uuid references staff_users (id),

  opened_by  uuid references staff_users (id),
  saved_at   timestamptz,
  saved_by   uuid references staff_users (id),

  cancelled_at     timestamptz,
  cancelled_by     uuid references staff_users (id),
  cancellation_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint visits_pkey primary key (id),
  constraint visits_tenant_key unique (clinic_id, id),
  constraint visits_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint visits_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,

  constraint visits_saved_consistent
    check ((status = 'SAVED') = (saved_at is not null)),
  constraint visits_cancelled_consistent
    check ((status = 'CANCELLED') = (cancelled_at is not null))
);

-- One open visit per pregnancy. A duplicate "start visit" request returns the
-- existing open visit rather than creating a second one — at eighty patients a
-- shift, a double-click on a slow connection is a certainty.
create unique index visits_one_open_per_pregnancy_idx
  on visits (pregnancy_id) where status = 'OPEN';

create index visits_pregnancy_history_idx on visits (pregnancy_id, occurred_at desc);
create index visits_clinic_day_idx on visits (clinic_id, occurred_at desc);

create trigger touch_visits
  before update on visits
  for each row execute function app.touch_row();

comment on column visits.ga_days_at_visit is
  'Frozen at save time. Never recomputed — a later redating must not rewrite the gestational age a past consultation was reasoned from.';

-- ---------------------------------------------------------------------------
-- visit_vitals
-- ---------------------------------------------------------------------------

create table visit_vitals (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id  uuid not null,

  -- Every value is nullable: a nurse recording only a weight is normal, and
  -- forcing placeholder zeros would fabricate readings.
  bp_systolic_mmhg  integer check (bp_systolic_mmhg  between 50 and 300),
  bp_diastolic_mmhg integer check (bp_diastolic_mmhg between 20 and 200),
  pulse_bpm         integer check (pulse_bpm between 20 and 250),
  respiratory_rate_bpm integer check (respiratory_rate_bpm between 4 and 80),
  temperature_c     numeric(4,1) check (temperature_c between 30 and 45),
  spo2_percent      integer check (spo2_percent between 50 and 100),
  weight_kg         numeric(5,2) check (weight_kg between 20 and 250),

  -- Obstetric measurements.
  fundal_height_cm     numeric(4,1) check (fundal_height_cm between 5 and 50),
  fetal_heart_rate_bpm integer check (fetal_heart_rate_bpm between 60 and 240),
  urine_albumin        dipstick_grade,
  urine_sugar          dipstick_grade,

  -- Which reading this is. A recheck is a new row, explicitly labelled.
  sequence_no integer not null default 1 check (sequence_no >= 1),
  note        text,

  recorded_at timestamptz not null default now(),
  recorded_by uuid references staff_users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint visit_vitals_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  constraint visit_vitals_sequence_unique unique (visit_id, sequence_no),
  -- A diastolic without a systolic is not a blood pressure.
  constraint visit_vitals_bp_paired
    check ((bp_systolic_mmhg is null) = (bp_diastolic_mmhg is null))
);

create index visit_vitals_visit_idx on visit_vitals (visit_id, sequence_no);

create trigger touch_visit_vitals
  before update on visit_vitals
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- visit_drafts
-- ---------------------------------------------------------------------------
-- Everything the clinician has done in the cockpit but not yet committed:
-- which extraction candidates they intend to verify, which findings to pin,
-- draft prescriptions, advice, and which patient queries they have addressed.
--
-- A draft is explicitly NOT a clinical record. It is never read by the referral
-- snapshot, never printed, and never surfaced as history.

create table visit_drafts (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id  uuid not null,
  author_id uuid not null references staff_users (id),

  -- Shape is owned and validated by src/modules/visits/visit.schema.ts. Stored
  -- as jsonb because it is transient UI state whose shape will change often;
  -- committed clinical data always lands in typed columns.
  payload jsonb not null default '{}'::jsonb,

  -- The visits.version this draft was started from. A save is rejected with a
  -- conflict if the visit has moved on underneath the editor.
  base_visit_version integer not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint visit_drafts_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete cascade,
  -- One draft per editor per visit.
  constraint visit_drafts_unique_author unique (visit_id, author_id)
);

create index visit_drafts_visit_idx on visit_drafts (visit_id);

create trigger touch_visit_drafts
  before update on visit_drafts
  for each row execute function app.touch_row();

comment on table visit_drafts is
  'Transient pre-commit state. Deleted when the visit is saved. Never a clinical record and never rendered as history.';

-- ---------------------------------------------------------------------------
-- visit_amendments
-- ---------------------------------------------------------------------------
-- A saved visit is read-only. Corrections are attributed amendments that
-- reference the original rather than editing it, so the record shows both what
-- was recorded and what was later corrected.

create table visit_amendments (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id  uuid not null,

  reason      text not null check (length(btrim(reason)) > 0),
  -- What changed, as a structured description. The superseded values remain in
  -- place; this records the correction and its justification.
  changes     jsonb not null,

  amended_by uuid not null references staff_users (id),
  amended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint visit_amendments_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict
);

create index visit_amendments_visit_idx on visit_amendments (visit_id, amended_at desc);

create trigger visit_amendments_append_only
  before update or delete on visit_amendments
  for each row execute function app.forbid_mutation();
