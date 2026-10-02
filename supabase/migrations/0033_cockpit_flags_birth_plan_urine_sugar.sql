-- ===========================================================================
-- 0033 — history flags, editable birth plan, urine sugar in mg/dL
-- ===========================================================================
--   1. Birth preparedness plan: the column (first added by hand on the hosted
--      project, recorded here) and a routine to write it from the cockpit.
--   2. History flags: a clinician can flag individual history entries
--      (obstetric, menstrual, family, past). A flag is a pointer for the
--      reader, never a classification this system makes.
--   3. Urine sugar is recorded as a number in mg/dL, not a dipstick grade. The
--      old graded column stays for readings already taken.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Birth plan
-- ---------------------------------------------------------------------------

alter table pregnancies add column if not exists birth_plan jsonb not null default '{}'::jsonb;

create or replace function public.save_birth_plan(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_expected_version    integer,
  p_plan                jsonb
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_version integer;
begin
  select * into v_row
    from pregnancies where clinic_id = p_clinic_id and id = p_pregnancy_id
    for update;
  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'Pregnancy % changed while it was being edited (expected version %, found %).',
      p_pregnancy_id, p_expected_version, v_row.version
      using errcode = 'serialization_failure';
  end if;

  update pregnancies
     set birth_plan = coalesce(p_plan, '{}'::jsonb)
   where id = p_pregnancy_id
  returning version into v_version;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'pregnancy.birth_plan_saved', 'pregnancies', p_pregnancy_id,
          jsonb_build_object('plan', p_plan, 'previous', v_row.birth_plan));

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. History flags
-- ---------------------------------------------------------------------------

alter table obstetric_history      add column if not exists flagged boolean not null default false;
alter table menstrual_histories    add column if not exists flagged boolean not null default false;
alter table family_histories       add column if not exists flagged boolean not null default false;
alter table patient_past_histories add column if not exists flagged boolean not null default false;

-- One routine for all four tables; the table name is checked against a fixed
-- list, never interpolated from the caller unchecked.
create or replace function public.set_history_flag(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_kind                text,
  p_entry_id            uuid,
  p_flagged             boolean
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_count integer;
begin
  v_table := case p_kind
    when 'OBSTETRIC' then 'obstetric_history'
    when 'MENSTRUAL' then 'menstrual_histories'
    when 'FAMILY'    then 'family_histories'
    when 'PAST'      then 'patient_past_histories'
  end;
  if v_table is null then
    raise exception 'Unknown history kind %', p_kind using errcode = 'check_violation';
  end if;

  execute format(
    'update %I set flagged = $1 where clinic_id = $2 and patient_id = $3 and id = $4',
    v_table
  ) using p_flagged, p_clinic_id, p_patient_id, p_entry_id;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'History entry % not found', p_entry_id using errcode = 'no_data_found';
  end if;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id,
          case when p_flagged then 'history.flagged' else 'history.unflagged' end,
          v_table, p_entry_id, jsonb_build_object('patient_id', p_patient_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Urine sugar in mg/dL
-- ---------------------------------------------------------------------------

alter table visit_vitals
  add column if not exists urine_sugar_mg_dl numeric(6, 1)
  check (urine_sugar_mg_dl between 0 and 5000);

comment on column visit_vitals.urine_sugar_mg_dl is
  'Urine glucose in mg/dL. Replaces the dipstick grade in urine_sugar for new readings; the graded column is kept for readings already taken.';

-- A new overload rather than a replacement: PostgREST picks it by the
-- p_urine_sugar_mg_dl argument name, and the graded version keeps working for
-- any build still deployed that sends p_urine_sugar.
create or replace function public.record_visit_vitals(
  p_clinic_id            uuid,
  p_actor_staff_user_id  uuid,
  p_request_id           text,
  p_visit_id             uuid,
  p_bp_systolic_mmhg     integer,
  p_bp_diastolic_mmhg    integer,
  p_pulse_bpm            integer,
  p_respiratory_rate_bpm integer,
  p_temperature_c        numeric,
  p_spo2_percent         integer,
  p_weight_kg            numeric,
  p_fundal_height_cm     numeric,
  p_fetal_heart_rate_bpm integer,
  p_urine_albumin        dipstick_grade,
  p_urine_sugar_mg_dl    numeric,
  p_note                 text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_status    visit_status;
  v_sequence  integer;
  v_vitals_id uuid;
begin
  select status into v_status
  from visits
  where clinic_id = p_clinic_id and id = p_visit_id
  for update;

  if not found then
    raise exception 'Visit % not found in clinic %', p_visit_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'OPEN' then
    raise exception 'Visit % is %; vitals can only be recorded on an open visit.',
      p_visit_id, v_status
      using errcode = 'restrict_violation';
  end if;

  select coalesce(max(sequence_no), 0) + 1 into v_sequence
  from visit_vitals
  where visit_id = p_visit_id;

  insert into visit_vitals (
    clinic_id, visit_id,
    bp_systolic_mmhg, bp_diastolic_mmhg, pulse_bpm, respiratory_rate_bpm,
    temperature_c, spo2_percent, weight_kg,
    fundal_height_cm, fetal_heart_rate_bpm,
    urine_albumin, urine_sugar_mg_dl,
    sequence_no, note, recorded_at, recorded_by
  ) values (
    p_clinic_id, p_visit_id,
    p_bp_systolic_mmhg, p_bp_diastolic_mmhg, p_pulse_bpm, p_respiratory_rate_bpm,
    p_temperature_c, p_spo2_percent, p_weight_kg,
    p_fundal_height_cm, p_fetal_heart_rate_bpm,
    p_urine_albumin, p_urine_sugar_mg_dl,
    v_sequence, nullif(btrim(coalesce(p_note, '')), ''), now(), p_actor_staff_user_id
  )
  returning id into v_vitals_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'visit.vitals_recorded', 'visit_vitals', v_vitals_id,
    jsonb_build_object(
      'visit_id',    p_visit_id,
      'sequence_no', v_sequence,
      'recorded',    (
        select coalesce(jsonb_agg(k), '[]'::jsonb)
        from unnest(array[
          case when p_bp_systolic_mmhg     is not null then 'blood_pressure' end,
          case when p_pulse_bpm            is not null then 'pulse' end,
          case when p_respiratory_rate_bpm is not null then 'respiratory_rate' end,
          case when p_temperature_c        is not null then 'temperature' end,
          case when p_spo2_percent         is not null then 'spo2' end,
          case when p_weight_kg            is not null then 'weight' end,
          case when p_fundal_height_cm     is not null then 'fundal_height' end,
          case when p_fetal_heart_rate_bpm is not null then 'fetal_heart_rate' end,
          case when p_urine_albumin        is not null then 'urine_albumin' end,
          case when p_urine_sugar_mg_dl    is not null then 'urine_sugar' end
        ]) as k
        where k is not null
      )
    )
  );

  return v_vitals_id;
end;
$$;

comment on function public.record_visit_vitals(
  uuid, uuid, text, uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer,
  dipstick_grade, numeric, text
) is
  'Appends a vitals reading, urine sugar in mg/dL. A recheck is a new row with the next sequence number, never an overwrite.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.save_birth_plan(uuid, uuid, text, uuid, integer, jsonb)',
    'public.set_history_flag(uuid, uuid, text, uuid, text, uuid, boolean)',
    'public.record_visit_vitals(uuid, uuid, text, uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer, dipstick_grade, numeric, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
