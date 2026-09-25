-- ---------------------------------------------------------------------------
-- 0031 — Patient home readings (self-monitoring)
-- ---------------------------------------------------------------------------
-- A condition a clinician has flagged on the pregnancy (gestational diabetes,
-- a hypertensive disorder) can call for daily monitoring at home between
-- visits — a blood sugar or a blood pressure taken with her own machine. This
-- is separate from `visit_vitals`: those are a clinician's own measurement,
-- taken and attributed at a consultation; this is hers, taken on her own
-- schedule, and is never presented as a clinical reading a doctor recorded.
--
-- One table, two shapes, chosen by `metric` — the same pattern as blood group
-- and its provenance (0003): the CHECK constraint ties the metric to exactly
-- the columns it needs and forbids the other shape's columns from being set at
-- the same time, so a row can never be ambiguous about which kind of reading
-- it is.
--
-- Same posture as `patient_queries` (0026): written only by the patient
-- portal's service role — there is no staff session on that side — and read
-- by clinic staff scoped to their own clinic.
-- ---------------------------------------------------------------------------

create type home_reading_metric as enum ('BLOOD_GLUCOSE', 'BLOOD_PRESSURE');

create type glucose_reading_context as enum (
  'FASTING', 'POST_BREAKFAST', 'POST_LUNCH', 'POST_DINNER', 'RANDOM'
);

create table patient_home_readings (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null,
  patient_id     uuid not null,
  pregnancy_id   uuid not null,

  metric         home_reading_metric not null,

  glucose_mg_dl  integer check (glucose_mg_dl is null or (glucose_mg_dl between 20 and 700)),
  glucose_context glucose_reading_context,

  systolic_mmhg  integer check (systolic_mmhg is null or (systolic_mmhg between 50 and 300)),
  diastolic_mmhg integer check (diastolic_mmhg is null or (diastolic_mmhg between 20 and 200)),

  -- When the measurement was taken. Supplied by the server as "now" at
  -- insert, never backdated by the client — a self-reported timeline is only
  -- trustworthy if it cannot be typed in after the fact.
  recorded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  constraint patient_home_readings_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint patient_home_readings_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,

  constraint patient_home_readings_shape check (
    case metric
      when 'BLOOD_GLUCOSE' then
        glucose_mg_dl is not null and glucose_context is not null
        and systolic_mmhg is null and diastolic_mmhg is null
      when 'BLOOD_PRESSURE' then
        systolic_mmhg is not null and diastolic_mmhg is not null
        and glucose_mg_dl is null and glucose_context is null
    end
  )
);

-- The trend chart's own access pattern: one patient, one metric, newest or
-- oldest first, within one pregnancy.
create index patient_home_readings_series_idx
  on patient_home_readings (clinic_id, patient_id, pregnancy_id, metric, recorded_at);

comment on table patient_home_readings is
  'Self-monitoring readings a patient logs from home (blood sugar, blood pressure) between visits. Written by the patient portal only. Not a clinical record — the clinician interprets it.';

-- ---------------------------------------------------------------------------
-- RLS — deny by default, member-scoped read, writes only through the service
-- role (the patient portal has no staff session to run as).
-- ---------------------------------------------------------------------------

alter table patient_home_readings enable row level security;
alter table patient_home_readings force row level security;

create policy patient_home_readings_member_read on patient_home_readings
  for select to authenticated
  using (app.is_clinic_member(clinic_id));

revoke all on patient_home_readings from anon;
