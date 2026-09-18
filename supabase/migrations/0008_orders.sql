-- ---------------------------------------------------------------------------
-- 0008 — Prescriptions, advice, immunizations, medication administrations
-- ---------------------------------------------------------------------------
-- The critical distinction in this migration:
--
--   prescriptions            what was ORDERED
--   medication_administrations  what was actually GIVEN
--
-- PRD §8 stored pre-referral doses as `jsonb[]` on the referral row. That is
-- the single most safety-critical data in the product — the reason the referral
-- slip exists is to stop a receiving unit re-loading magnesium sulphate on a
-- patient who already had it. An order is not evidence of administration, and
-- a free-form JSON blob cannot be queried, validated or audited.
--
-- `prescriptions.is_ongoing bool` is also replaced. A mutable flag on a past
-- visit's row means that stopping a drug requires editing a historical
-- consultation record. Status plus a date range expresses the same thing
-- without rewriting history: "ongoing" is a query, not a column.
-- ---------------------------------------------------------------------------

create type dose_frequency as enum ('OD', 'BD', 'TDS', 'QID', 'HS', 'SOS', 'PRN', 'STAT', 'WEEKLY', 'OTHER');

create type food_relation as enum ('BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'NOT_SPECIFIED');

create type medication_route as enum ('ORAL', 'IV', 'IM', 'SC', 'PR', 'PV', 'TOPICAL', 'INHALED', 'OTHER');

create type prescription_status as enum ('ACTIVE', 'COMPLETED', 'STOPPED', 'SUPERSEDED');

create type immunization_status as enum ('PLANNED', 'GIVEN', 'NOT_GIVEN', 'UNKNOWN');

create type administration_certainty as enum (
  'WITNESSED',        -- recorded by the person who gave it
  'DOCUMENTED',       -- transcribed from another facility's written record
  'PATIENT_REPORTED', -- stated by the patient or attendant
  'UNCERTAIN'
);

-- ---------------------------------------------------------------------------
-- prescriptions
-- ---------------------------------------------------------------------------

create table prescriptions (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  pregnancy_id uuid not null,
  -- The consultation at which it was ordered.
  visit_id     uuid not null,

  medicine_name text not null check (length(btrim(medicine_name)) > 0),
  -- Dose is a number plus a unit, never a string like "500mg" (ARCH-9).
  dose_amount   numeric(10,3) check (dose_amount > 0),
  dose_unit     text,
  form          text,                      -- 'Tab', 'Cap', 'Syrup', 'Inj'
  route         medication_route not null default 'ORAL',
  frequency     dose_frequency not null,
  food_relation food_relation not null default 'NOT_SPECIFIED',
  duration_days integer check (duration_days > 0),

  start_date date not null default current_date,
  end_date   date,

  status prescription_status not null default 'ACTIVE',
  -- When a prescription is changed, a new row supersedes the old one. The old
  -- row keeps its original visit and its original text.
  supersedes_id uuid,
  stopped_at    timestamptz,
  stopped_by    uuid references staff_users (id),
  stop_reason   text,

  instructions text,

  prescribed_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint prescriptions_pkey primary key (id),
  constraint prescriptions_tenant_key unique (clinic_id, id),
  constraint prescriptions_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint prescriptions_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  constraint prescriptions_supersedes_fk
    foreign key (clinic_id, supersedes_id) references prescriptions (clinic_id, id) on delete restrict,
  constraint prescriptions_dose_has_unit
    check ((dose_amount is null) = (dose_unit is null)),
  constraint prescriptions_dates_ordered
    check (end_date is null or end_date >= start_date),
  constraint prescriptions_stop_explained
    check (status <> 'STOPPED' or stopped_at is not null)
);

-- "Ongoing Rx" (cockpit accordion 1) is this query, not a stored flag.
create index prescriptions_active_idx
  on prescriptions (pregnancy_id, start_date desc) where status = 'ACTIVE';

create index prescriptions_visit_idx on prescriptions (visit_id);

create trigger touch_prescriptions
  before update on prescriptions
  for each row execute function app.touch_row();

comment on index prescriptions_active_idx is
  'Backs the Ongoing Rx accordion. Ongoing is derived from status and dates so that stopping a drug never edits a past visit record.';

-- ---------------------------------------------------------------------------
-- visit_advice
-- ---------------------------------------------------------------------------

create table visit_advice (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id  uuid not null,

  -- Named checklist items from the MCP card workflow.
  dfkc_counselled          boolean not null default false,  -- daily fetal kick count
  nutrition_counselled     boolean not null default false,
  left_lateral_rest        boolean not null default false,
  danger_signs_counselled  boolean not null default false,

  lab_orders  text[] not null default '{}',
  scan_orders text[] not null default '{}',

  next_followup_date date,
  additional_advice  text,

  recorded_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint visit_advice_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  -- One advice record per visit.
  constraint visit_advice_one_per_visit unique (visit_id)
);

create trigger touch_visit_advice
  before update on visit_advice
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- medication_administrations
-- ---------------------------------------------------------------------------
-- What was actually given, and when. This is the anti-redosing record that the
-- emergency referral slip is built around.
--
-- `administered_at` is mandatory and is a timestamptz, because the entire
-- clinical value of the record is the elapsed time since the dose. A magnesium
-- sulphate loading dose given "today" is not actionable information; one given
-- at 01:40 is.

create table medication_administrations (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,
  -- Null for doses given outside a consultation (labour room, ambulance,
  -- referring facility).
  visit_id     uuid,

  medicine_name text not null check (length(btrim(medicine_name)) > 0),
  dose_amount   numeric(10,3) not null check (dose_amount > 0),
  dose_unit     text not null check (length(btrim(dose_unit)) > 0),
  route         medication_route not null,

  -- Mandatory. See header.
  administered_at timestamptz not null,
  administered_at_facility text,

  certainty administration_certainty not null default 'WITNESSED',
  note      text,

  recorded_by uuid not null references staff_users (id),
  recorded_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint medication_administrations_pkey primary key (id),
  constraint medication_administrations_tenant_key unique (clinic_id, id),
  constraint medication_administrations_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint medication_administrations_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint medication_administrations_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  -- A dose cannot have been given in the future.
  constraint medication_administrations_not_future
    check (administered_at <= now() + interval '1 hour')
);

create index medication_administrations_recent_idx
  on medication_administrations (pregnancy_id, administered_at desc);

create trigger touch_medication_administrations
  before update on medication_administrations
  for each row execute function app.touch_row();

comment on table medication_administrations is
  'Doses actually given, with mandatory timestamps. Prefills the referral snapshot. An order in `prescriptions` is NOT evidence that a dose was given.';

-- ---------------------------------------------------------------------------
-- immunizations
-- ---------------------------------------------------------------------------

create table immunizations (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,

  vaccine text not null check (length(btrim(vaccine)) > 0),   -- 'Td1', 'Td2', 'Td_Booster'
  status  immunization_status not null default 'PLANNED',

  administered_on date,
  administered_at_facility text,
  batch_number text,
  source data_source not null default 'STAFF_ENTERED',

  recorded_by uuid references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint immunizations_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint immunizations_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint immunizations_given_has_date
    check (status <> 'GIVEN' or administered_on is not null),
  constraint immunizations_unique_per_pregnancy unique (pregnancy_id, vaccine)
);

create index immunizations_pregnancy_idx on immunizations (pregnancy_id);

create trigger touch_immunizations
  before update on immunizations
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- anti_d_events
-- ---------------------------------------------------------------------------
-- Rh-negative management, recorded as events rather than as PRD §8's
-- `anti_d_status enum('not_applicable','due','given')`. "Due" is a clinical
-- determination that depends on gestational age, sensitising events, partner
-- typing and antibody titres — the system must not compute it (PRD §3).
--
-- What the system CAN do is show the facts: this is what was given, this is
-- when, this is the latest titre. The clinician decides what is due.

create table anti_d_events (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,

  event_type text not null check (event_type in ('PROPHYLAXIS_GIVEN', 'INDICATED_BY_CLINICIAN', 'TITRE_RECORDED')),

  occurred_at timestamptz not null,
  dose_amount numeric(10,3),
  dose_unit   text,
  titre_text  text,
  note        text,

  -- When a clinician marks Anti-D indicated, that is their judgment, recorded
  -- with attribution.
  recorded_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint anti_d_events_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint anti_d_events_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint anti_d_events_dose_has_unit
    check ((dose_amount is null) = (dose_unit is null))
);

create index anti_d_events_pregnancy_idx on anti_d_events (pregnancy_id, occurred_at desc);

create trigger touch_anti_d_events
  before update on anti_d_events
  for each row execute function app.touch_row();

comment on table anti_d_events is
  'Facts about Anti-D, not a computed due/not-due status. The red header pill shows Rh-negative plus the latest event; it never asserts that a dose is due.';
