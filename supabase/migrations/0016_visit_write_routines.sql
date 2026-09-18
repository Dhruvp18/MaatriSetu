-- ---------------------------------------------------------------------------
-- 0016 — Transactional write routines for the visits module
-- ---------------------------------------------------------------------------
-- Opening a visit is the one write in this system that is naturally idempotent,
-- and it has to be. At eighty patients a shift on hospital wifi, "start visit"
-- gets double-clicked, and the request gets retried after a timeout that
-- actually succeeded. A second OPEN visit for the same pregnancy would split
-- one consultation's vitals, orders and review decisions across two records.
--
-- The partial unique index from 0005 makes two open visits impossible. This
-- routine turns that from an error into the behaviour the workflow wants:
-- a repeated request returns the visit already open, and says it did not create
-- one, so the UI can reopen rather than reporting a conflict at the counter.
--
-- These routines persist and audit. They make no authorization decisions — the
-- service has already checked membership and permission (ARCH-5).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- open_or_reuse_visit
-- ---------------------------------------------------------------------------
-- Returns jsonb: { "visit_id": uuid, "created": boolean }.
--
-- `patient_id` is read off the pregnancy rather than accepted as an argument.
-- The composite foreign keys already prevent a cross-clinic reference, but
-- nothing would stop a caller passing this clinic's patient A with this
-- clinic's pregnancy B. Deriving it removes that class of mismatch entirely
-- instead of validating against it.
--
-- The gestational age is deliberately NOT recorded here. `visits.ga_days_at_visit`
-- is frozen at save (0005); while a visit is open the cockpit computes POG live
-- from the pregnancy's dating anchor, so a redating mid-consultation is
-- reflected immediately rather than showing a number captured at check-in.

create or replace function public.open_or_reuse_visit(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_visit_type          visit_type
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_patient_id uuid;
  v_status     pregnancy_status;
  v_visit_id   uuid;
begin
  -- Locking the pregnancy row serializes concurrent "start visit" requests for
  -- the same episode, so the check below and the insert cannot interleave.
  select patient_id, status into v_patient_id, v_status
  from pregnancies
  where clinic_id = p_clinic_id and id = p_pregnancy_id
  for update;

  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_status <> 'ACTIVE' then
    raise exception 'Pregnancy % is closed; a visit cannot be opened on it.', p_pregnancy_id
      using errcode = 'restrict_violation';
  end if;

  select id into v_visit_id
  from visits
  where clinic_id = p_clinic_id
    and pregnancy_id = p_pregnancy_id
    and status = 'OPEN';

  if found then
    -- The repeat case. No audit row: nothing changed, and a stream of
    -- "visit.opened" entries from one double-click would be noise in the
    -- record rather than history.
    return jsonb_build_object('visit_id', v_visit_id, 'created', false);
  end if;

  insert into visits (
    clinic_id, patient_id, pregnancy_id, visit_type, status,
    occurred_at, opened_by, clinician_id
  ) values (
    p_clinic_id, v_patient_id, p_pregnancy_id, p_visit_type, 'OPEN',
    now(), p_actor_staff_user_id,
    -- Left null here. The clinician responsible is whoever saves the
    -- consultation, which is frequently not whoever opened it: a nurse opens
    -- the visit and records vitals before the doctor ever sees the patient.
    null
  )
  returning id into v_visit_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'visit.opened', 'visits', v_visit_id,
    jsonb_build_object(
      'pregnancy_id', p_pregnancy_id,
      'patient_id',   v_patient_id,
      'visit_type',   p_visit_type::text
    )
  );

  return jsonb_build_object('visit_id', v_visit_id, 'created', true);
end;
$$;

comment on function public.open_or_reuse_visit is
  'Idempotent by natural key: one OPEN visit per pregnancy. A repeated request returns the existing visit with created=false. Derives patient_id from the pregnancy.';

-- ---------------------------------------------------------------------------
-- record_visit_vitals
-- ---------------------------------------------------------------------------
-- Vitals are rows, not columns (0005). A blood-pressure recheck fifteen minutes
-- later is routine antenatal practice, and it is a NEW row — overwriting the
-- first reading would destroy exactly the comparison the recheck was performed
-- to make.
--
-- The sequence number is assigned here, under the visit's lock, rather than
-- being supplied by the caller. Two nurses recording simultaneously would
-- otherwise both compute the same "next" number and one insert would fail on
-- the unique constraint.

create or replace function public.record_visit_vitals(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_visit_id            uuid,
  p_bp_systolic_mmhg    integer,
  p_bp_diastolic_mmhg   integer,
  p_pulse_bpm           integer,
  p_respiratory_rate_bpm integer,
  p_temperature_c       numeric,
  p_spo2_percent        integer,
  p_weight_kg           numeric,
  p_fundal_height_cm    numeric,
  p_fetal_heart_rate_bpm integer,
  p_urine_albumin       dipstick_grade,
  p_urine_sugar         dipstick_grade,
  p_note                text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_status   visit_status;
  v_sequence integer;
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

  -- A saved visit is read-only. A reading taken afterwards belongs to the next
  -- visit, or to an attributed amendment — not appended silently to a closed
  -- consultation.
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
    urine_albumin, urine_sugar,
    sequence_no, note, recorded_at, recorded_by
  ) values (
    p_clinic_id, p_visit_id,
    p_bp_systolic_mmhg, p_bp_diastolic_mmhg, p_pulse_bpm, p_respiratory_rate_bpm,
    p_temperature_c, p_spo2_percent, p_weight_kg,
    p_fundal_height_cm, p_fetal_heart_rate_bpm,
    p_urine_albumin, p_urine_sugar,
    v_sequence, nullif(btrim(coalesce(p_note, '')), ''), now(), p_actor_staff_user_id
  )
  returning id into v_vitals_id;

  -- The audit payload records which reading this was and which values were
  -- present, not the values themselves — they are one join away in a table
  -- that is already access-controlled.
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
          case when p_bp_systolic_mmhg   is not null then 'blood_pressure' end,
          case when p_pulse_bpm          is not null then 'pulse' end,
          case when p_respiratory_rate_bpm is not null then 'respiratory_rate' end,
          case when p_temperature_c      is not null then 'temperature' end,
          case when p_spo2_percent       is not null then 'spo2' end,
          case when p_weight_kg          is not null then 'weight' end,
          case when p_fundal_height_cm   is not null then 'fundal_height' end,
          case when p_fetal_heart_rate_bpm is not null then 'fetal_heart_rate' end,
          case when p_urine_albumin      is not null then 'urine_albumin' end,
          case when p_urine_sugar        is not null then 'urine_sugar' end
        ]) as k
        where k is not null
      )
    )
  );

  return v_vitals_id;
end;
$$;

comment on function public.record_visit_vitals is
  'Appends a vitals reading. A recheck is a new row with the next sequence number, never an overwrite. Assigns the sequence under the visit lock.';

-- ---------------------------------------------------------------------------
-- cancel_visit
-- ---------------------------------------------------------------------------
-- For a visit opened in error — the wrong patient's file scanned, a duplicate
-- started at a second terminal. Version-checked, and a reason is mandatory:
-- a cancelled consultation that does not say why is indistinguishable from one
-- abandoned because the patient deteriorated.

create or replace function public.cancel_visit(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_visit_id            uuid,
  p_expected_version    integer,
  p_reason              text
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_status  visit_status;
  v_new_version integer;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A cancellation reason is required.'
      using errcode = 'invalid_parameter_value';
  end if;

  select version, status into v_version, v_status
  from visits
  where clinic_id = p_clinic_id and id = p_visit_id
  for update;

  if not found then
    raise exception 'Visit % not found in clinic %', p_visit_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_version <> p_expected_version then
    raise exception
      'Visit % changed since it was read (expected version %, found %).',
      p_visit_id, p_expected_version, v_version
      using errcode = 'serialization_failure';
  end if;

  -- A saved consultation is a clinical record. Undoing it is an attributed
  -- amendment against the original, never a cancellation.
  if v_status <> 'OPEN' then
    raise exception 'Visit % is %; only an open visit can be cancelled.', p_visit_id, v_status
      using errcode = 'restrict_violation';
  end if;

  update visits
     set status              = 'CANCELLED',
         cancelled_at        = now(),
         cancelled_by        = p_actor_staff_user_id,
         cancellation_reason = btrim(p_reason)
   where clinic_id = p_clinic_id and id = p_visit_id
  returning version into v_new_version;

  -- Any draft belonging to this visit is removed by the cascade on
  -- visit_drafts. A draft is one clinician's unfinished thinking, never a
  -- clinical record, so nothing is lost from the permanent record.

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'visit.cancelled', 'visits', p_visit_id,
    jsonb_build_object('reason', btrim(p_reason))
  );

  return v_new_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.open_or_reuse_visit(uuid, uuid, text, uuid, visit_type)',
    'public.record_visit_vitals(uuid, uuid, text, uuid, integer, integer, integer, integer, numeric, integer, numeric, numeric, integer, dipstick_grade, dipstick_grade, text)',
    'public.cancel_visit(uuid, uuid, text, uuid, integer, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
