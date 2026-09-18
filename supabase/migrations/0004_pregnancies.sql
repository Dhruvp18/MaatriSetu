-- ---------------------------------------------------------------------------
-- 0004 — Pregnancy episodes, dating, and prior obstetric history
-- ---------------------------------------------------------------------------
-- The pregnancy episode is the missing entity in PRD §8 and the reason this
-- migration exists. Antenatal care is organized around an episode, not around a
-- person: a mother returning eighteen months later is the same patient with a
-- new pregnancy, new dating, new labs and new scans. Hanging LMP and GPLA off
-- `patients` means her second visit silently rewrites her first pregnancy.
--
-- DATING MODEL
-- ------------
-- Gestational age is stored as a *reference point*, not as an LMP:
--
--     dating_reference_date    — a calendar date
--     dating_reference_ga_days — gestational age, in days, on that date
--
-- POG on any later date is then plain arithmetic:
--     ga_days = dating_reference_ga_days + (target_date - dating_reference_date)
--
-- This represents both dating methods uniformly. LMP dating is the reference
-- date = LMP with ga = 0. Ultrasound redating is reference date = scan date
-- with ga = the scan's measured gestational age. Real practice routinely
-- redates from a first-trimester scan, and a schema that can only express "LMP"
-- forces staff to back-calculate a fake LMP — which then propagates as though
-- it were a recalled fact.
--
-- POG is never stored as a live value. It is computed at read time from this
-- reference (PRD §7, decision 4), and snapshotted onto a visit at save time so
-- the historical record stays fixed.
-- ---------------------------------------------------------------------------

create type pregnancy_status as enum (
  'ACTIVE',
  'COMPLETED',        -- outcome recorded
  'CLOSED_UNKNOWN'    -- lost to follow-up; outcome genuinely not known
);

create type dating_method as enum (
  'LMP',                 -- last menstrual period, recalled or documented
  'ULTRASOUND',          -- dated or redated from a scan
  'CLINICAL_ESTIMATE',   -- fundal height / examination, when nothing else exists
  'UNKNOWN'
);

create type dating_certainty as enum ('CERTAIN', 'APPROXIMATE', 'UNKNOWN');

create type pregnancy_outcome as enum (
  'LIVE_BIRTH', 'STILLBIRTH', 'ABORTION_SPONTANEOUS', 'ABORTION_INDUCED',
  'ECTOPIC', 'MOLAR', 'UNKNOWN'
);

create type delivery_mode as enum (
  'VAGINAL', 'ASSISTED_VAGINAL', 'LSCS_EMERGENCY', 'LSCS_ELECTIVE', 'UNKNOWN'
);

-- ---------------------------------------------------------------------------
-- pregnancies
-- ---------------------------------------------------------------------------

create table pregnancies (
  id         uuid not null default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  status     pregnancy_status not null default 'ACTIVE',

  -- Dating reference (see header). Both columns are null until dating is
  -- established; a pregnancy with unknown dating is a real and common state,
  -- and the cockpit must show "dating not established" rather than a guess.
  dating_reference_date    date,
  dating_reference_ga_days integer check (dating_reference_ga_days between 0 and 315),
  dating_method            dating_method not null default 'UNKNOWN',
  dating_certainty         dating_certainty not null default 'UNKNOWN',
  dating_confirmed_by      uuid references staff_users (id),
  dating_confirmed_at      timestamptz,

  -- The LMP as actually stated by the mother, kept verbatim for the record even
  -- when dating is later taken from a scan. Never used for computation unless
  -- it is also the dating reference.
  reported_lmp             date,
  reported_lmp_certainty   dating_certainty not null default 'UNKNOWN',

  -- GPLA as it stood at the start of THIS pregnancy. Snapshotted rather than
  -- derived, because prior events may predate this clinic's records entirely.
  gravida   integer check (gravida   >= 1),
  parity    integer check (parity    >= 0),
  living    integer check (living    >= 0),
  abortions integer check (abortions >= 0),

  pre_pregnancy_weight_kg numeric(5,2) check (pre_pregnancy_weight_kg > 0),
  height_cm               numeric(5,2) check (height_cm > 0),

  outcome        pregnancy_outcome,
  outcome_date   date,
  closed_at      timestamptz,
  closed_by      uuid references staff_users (id),
  closure_note   text,

  created_by uuid references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint pregnancies_pkey primary key (id),
  constraint pregnancies_tenant_key unique (clinic_id, id),
  constraint pregnancies_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,

  -- A dating reference is meaningless with only half of its pair.
  constraint pregnancies_dating_reference_complete
    check ((dating_reference_date is null) = (dating_reference_ga_days is null)),

  -- A completed pregnancy has an outcome; an active one does not.
  constraint pregnancies_outcome_consistent
    check (
      (status = 'ACTIVE'         and outcome is null and closed_at is null) or
      (status = 'COMPLETED'      and outcome is not null and closed_at is not null) or
      (status = 'CLOSED_UNKNOWN' and closed_at is not null)
    )
);

-- At most one active pregnancy per patient. A second concurrent episode is
-- almost always a data-entry error; correcting it must be an explicit,
-- audited act rather than a silent overwrite.
create unique index pregnancies_one_active_per_patient_idx
  on pregnancies (patient_id) where status = 'ACTIVE';

create index pregnancies_patient_idx on pregnancies (patient_id, created_at desc);

create trigger touch_pregnancies
  before update on pregnancies
  for each row execute function app.touch_row();

comment on table pregnancies is
  'One antenatal episode. All labs, scans, visits and referrals hang off a pregnancy, never off the patient directly.';

comment on column pregnancies.dating_reference_ga_days is
  'Gestational age in DAYS at dating_reference_date. With reference_date = LMP this is 0. With ultrasound redating it is the scan-measured GA.';

-- ---------------------------------------------------------------------------
-- obstetric_history
-- ---------------------------------------------------------------------------
-- Prior pregnancies, including those that happened elsewhere or before this
-- clinic existed. Replaces PRD §8's `previous_scars jsonb[]`, which could not
-- record provenance, could not be queried, and carried an `interval_ok` flag
-- that is a clinical interpretation the system must not make.

create table obstetric_history (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  -- Ordinal within the patient's obstetric history: 1 = first pregnancy.
  sequence_no integer not null check (sequence_no >= 1),

  -- If this prior pregnancy was itself managed here, link it. Usually null.
  pregnancy_id uuid,

  year_of_event     integer check (year_of_event between 1950 and 2100),
  event_date        date,
  event_date_precision date_precision not null default 'YEAR',

  outcome        pregnancy_outcome not null default 'UNKNOWN',
  delivery_mode  delivery_mode not null default 'UNKNOWN',
  gestation_weeks_at_delivery integer check (gestation_weeks_at_delivery between 16 and 45),

  birth_weight_grams integer check (birth_weight_grams between 200 and 7000),
  child_alive        known_status not null default 'UNKNOWN',

  -- Uterine scar facts, recorded as facts. The interval between this event and
  -- the current pregnancy is arithmetic the UI may display; whether that
  -- interval is acceptable is a clinical judgment the system does not make.
  has_uterine_scar boolean not null default false,
  scar_indication  text,

  complications text,
  place_of_event text,

  source      data_source not null default 'PATIENT_REPORTED',
  recorded_by uuid references staff_users (id),
  recorded_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint obstetric_history_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint obstetric_history_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint obstetric_history_sequence_unique unique (patient_id, sequence_no)
);

create index obstetric_history_patient_idx on obstetric_history (patient_id, sequence_no);

create trigger touch_obstetric_history
  before update on obstetric_history
  for each row execute function app.touch_row();

comment on column obstetric_history.has_uterine_scar is
  'A recorded fact. The system does not evaluate inter-delivery interval adequacy — that is clinical judgment (PRD §3, non-goals).';
