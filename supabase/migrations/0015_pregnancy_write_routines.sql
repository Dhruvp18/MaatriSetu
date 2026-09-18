-- ---------------------------------------------------------------------------
-- 0015 — Transactional write routines for the pregnancies module
-- ---------------------------------------------------------------------------
-- Same reasoning as 0013: these writes span several tables, and the REST client
-- cannot put them in one transaction. Creating an episode writes the pregnancy,
-- her prior obstetric history and an audit row; a partial result would leave a
-- pregnancy whose recorded history is missing the previous caesarean, which is
-- precisely the fact the next clinician looks for.
--
-- Redating and closure are single-row updates, but both carry an optimistic
-- concurrency check and an audit row, and both must happen together. A redating
-- that lands without its audit row is an unexplained change to every derived
-- date on the record.
--
-- These routines persist and audit. They make no authorization decisions — the
-- service has already checked membership and permission (ARCH-5).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- create_pregnancy
-- ---------------------------------------------------------------------------
-- The "at most one ACTIVE pregnancy per patient" rule is enforced by the
-- partial unique index from 0004, not by a check here. The service pre-checks
-- so it can return the existing episode's id in a friendly conflict; the index
-- is what makes the rule true under concurrency.

create or replace function public.create_pregnancy(
  p_clinic_id               uuid,
  p_actor_staff_user_id     uuid,
  p_request_id              text,
  p_patient_id              uuid,
  p_dating_reference_date   date,
  p_dating_reference_ga_days integer,
  p_dating_method           dating_method,
  p_dating_certainty        dating_certainty,
  p_reported_lmp            date,
  p_reported_lmp_certainty  dating_certainty,
  p_gravida                 integer,
  p_parity                  integer,
  p_living                  integer,
  p_abortions               integer,
  p_pre_pregnancy_weight_kg numeric,
  p_height_cm               numeric,
  p_obstetric_history       jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_pregnancy_id uuid;
  v_history jsonb := coalesce(p_obstetric_history, '[]'::jsonb);
  v_dating_established boolean := p_dating_reference_date is not null;
begin
  insert into pregnancies (
    clinic_id, patient_id, status,
    dating_reference_date, dating_reference_ga_days,
    dating_method, dating_certainty,
    -- Dating is confirmed by whoever established it, at the moment they did.
    -- Left null when there is no anchor: nobody has confirmed an absence.
    dating_confirmed_by, dating_confirmed_at,
    reported_lmp, reported_lmp_certainty,
    gravida, parity, living, abortions,
    pre_pregnancy_weight_kg, height_cm,
    created_by
  ) values (
    p_clinic_id, p_patient_id, 'ACTIVE',
    p_dating_reference_date, p_dating_reference_ga_days,
    p_dating_method, p_dating_certainty,
    case when v_dating_established then p_actor_staff_user_id end,
    case when v_dating_established then now() end,
    p_reported_lmp, p_reported_lmp_certainty,
    p_gravida, p_parity, p_living, p_abortions,
    p_pre_pregnancy_weight_kg, p_height_cm,
    p_actor_staff_user_id
  )
  returning id into v_pregnancy_id;

  -- Prior pregnancies belong to the patient, not to this episode, so they are
  -- written against patient_id. They are inserted here only because this is
  -- when the clinic usually learns them.
  insert into obstetric_history (
    clinic_id, patient_id, sequence_no,
    year_of_event, event_date, event_date_precision,
    outcome, delivery_mode, gestation_weeks_at_delivery,
    birth_weight_grams, child_alive,
    has_uterine_scar, scar_indication,
    complications, place_of_event,
    source, recorded_by
  )
  select
    p_clinic_id,
    p_patient_id,
    (h ->> 'sequenceNo')::integer,
    nullif(h ->> 'yearOfEvent', '')::integer,
    nullif(h ->> 'eventDate', '')::date,
    (h ->> 'eventDatePrecision')::date_precision,
    (h ->> 'outcome')::pregnancy_outcome,
    (h ->> 'deliveryMode')::delivery_mode,
    nullif(h ->> 'gestationWeeksAtDelivery', '')::integer,
    nullif(h ->> 'birthWeightGrams', '')::integer,
    (h ->> 'childAlive')::known_status,
    coalesce((h ->> 'hasUterineScar')::boolean, false),
    nullif(btrim(coalesce(h ->> 'scarIndication', '')), ''),
    nullif(btrim(coalesce(h ->> 'complications', '')), ''),
    nullif(btrim(coalesce(h ->> 'placeOfEvent', '')), ''),
    (h ->> 'source')::data_source,
    p_actor_staff_user_id
  from jsonb_array_elements(v_history) as h
  -- A prior pregnancy already recorded for this patient is not duplicated when
  -- a second episode is opened years later.
  on conflict (patient_id, sequence_no) do nothing;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'pregnancy.created', 'pregnancies', v_pregnancy_id,
    jsonb_build_object(
      'patient_id',        p_patient_id,
      'dating_method',     p_dating_method::text,
      'dating_certainty',  p_dating_certainty::text,
      'dating_established', v_dating_established,
      'history_entries',   jsonb_array_length(v_history)
    )
  );

  return v_pregnancy_id;
end;
$$;

comment on function public.create_pregnancy is
  'Atomically creates a pregnancy episode with prior obstetric history and an audit row. Performs no authorization.';

-- ---------------------------------------------------------------------------
-- update_pregnancy_dating
-- ---------------------------------------------------------------------------
-- Redating moves the EDD, the POG badge and every milestone window. It is
-- therefore version-checked and always audited with the clinician's reason, and
-- the audit payload keeps the OLD anchor as well as the new one — "what was it
-- dated as before" is the first question asked when two documents disagree.
--
-- It deliberately does not touch visits.ga_days_at_visit on past saved visits.
-- Those are frozen records of what the clinician reasoned from that day.

create or replace function public.update_pregnancy_dating(
  p_clinic_id             uuid,
  p_actor_staff_user_id   uuid,
  p_request_id            text,
  p_pregnancy_id          uuid,
  p_expected_version      integer,
  p_dating_reference_date date,
  p_dating_reference_ga_days integer,
  p_dating_method         dating_method,
  p_dating_certainty      dating_certainty,
  p_reason                text
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_old record;
  v_new_version integer;
begin
  select dating_reference_date, dating_reference_ga_days, dating_method,
         dating_certainty, version, status
    into v_old
  from pregnancies
  where clinic_id = p_clinic_id and id = p_pregnancy_id
  for update;

  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_old.version <> p_expected_version then
    raise exception
      'Pregnancy % changed since it was read (expected version %, found %).',
      p_pregnancy_id, p_expected_version, v_old.version
      using errcode = 'serialization_failure';
  end if;

  if v_old.status <> 'ACTIVE' then
    raise exception 'Pregnancy % is not active; its dating cannot be changed.', p_pregnancy_id
      using errcode = 'restrict_violation';
  end if;

  update pregnancies
     set dating_reference_date    = p_dating_reference_date,
         dating_reference_ga_days = p_dating_reference_ga_days,
         dating_method            = p_dating_method,
         dating_certainty         = p_dating_certainty,
         dating_confirmed_by      = p_actor_staff_user_id,
         dating_confirmed_at      = now()
   where clinic_id = p_clinic_id and id = p_pregnancy_id
  returning version into v_new_version;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'pregnancy.redated', 'pregnancies', p_pregnancy_id,
    jsonb_build_object(
      'reason', p_reason,
      'from', jsonb_build_object(
        'reference_date',  v_old.dating_reference_date,
        'reference_ga_days', v_old.dating_reference_ga_days,
        'method',    v_old.dating_method::text,
        'certainty', v_old.dating_certainty::text
      ),
      'to', jsonb_build_object(
        'reference_date',  p_dating_reference_date,
        'reference_ga_days', p_dating_reference_ga_days,
        'method',    p_dating_method::text,
        'certainty', p_dating_certainty::text
      )
    )
  );

  return v_new_version;
end;
$$;

comment on function public.update_pregnancy_dating is
  'Version-checked redating. Audits the previous anchor alongside the new one. Never rewrites the gestational age frozen on past saved visits.';

-- ---------------------------------------------------------------------------
-- close_pregnancy
-- ---------------------------------------------------------------------------
-- COMPLETED carries an outcome. CLOSED_UNKNOWN is for a mother genuinely lost
-- to follow-up, and is a distinct, honest state rather than an outcome of
-- 'UNKNOWN' the clinic never actually observed.

create or replace function public.close_pregnancy(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_expected_version    integer,
  p_status              pregnancy_status,
  p_outcome             pregnancy_outcome,
  p_outcome_date        date,
  p_note                text
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_status  pregnancy_status;
  v_new_version integer;
begin
  if p_status not in ('COMPLETED', 'CLOSED_UNKNOWN') then
    raise exception 'close_pregnancy accepts COMPLETED or CLOSED_UNKNOWN, not %', p_status
      using errcode = 'invalid_parameter_value';
  end if;

  select version, status into v_version, v_status
  from pregnancies
  where clinic_id = p_clinic_id and id = p_pregnancy_id
  for update;

  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_version <> p_expected_version then
    raise exception
      'Pregnancy % changed since it was read (expected version %, found %).',
      p_pregnancy_id, p_expected_version, v_version
      using errcode = 'serialization_failure';
  end if;

  if v_status <> 'ACTIVE' then
    raise exception 'Pregnancy % is already closed.', p_pregnancy_id
      using errcode = 'restrict_violation';
  end if;

  update pregnancies
     set status       = p_status,
         outcome      = case when p_status = 'COMPLETED' then p_outcome end,
         outcome_date = case when p_status = 'COMPLETED' then p_outcome_date end,
         closed_at    = now(),
         closed_by    = p_actor_staff_user_id,
         closure_note = nullif(btrim(coalesce(p_note, '')), '')
   where clinic_id = p_clinic_id and id = p_pregnancy_id
  returning version into v_new_version;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'pregnancy.closed', 'pregnancies', p_pregnancy_id,
    jsonb_build_object(
      'status',       p_status::text,
      'outcome',      case when p_status = 'COMPLETED' then p_outcome::text end,
      'outcome_date', p_outcome_date
    )
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
    'public.create_pregnancy(uuid, uuid, text, uuid, date, integer, dating_method, dating_certainty, date, dating_certainty, integer, integer, integer, integer, numeric, numeric, jsonb)',
    'public.update_pregnancy_dating(uuid, uuid, text, uuid, integer, date, integer, dating_method, dating_certainty, text)',
    'public.close_pregnancy(uuid, uuid, text, uuid, integer, pregnancy_status, pregnancy_outcome, date, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
