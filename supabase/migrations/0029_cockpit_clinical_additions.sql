-- ===========================================================================
-- 0029 — cockpit clinical additions
-- ===========================================================================
-- What the OPD asked for after using the cockpit:
--
--   1. Chief complaints per visit, each with how long (n days/weeks/months/years).
--   2. Examination split into per abdomen, per vaginum and per speculum.
--   3. Marriage (years married, consanguinity) and how this pregnancy was
--      conceived, recorded on the pregnancy alongside height.
--   4. Bowel / bladder symptoms on the menstrual history.
--   5. Diagnoses a clinician flags onto the banner, until she marks them resolved.
--   6. The husband's blood group, for an Rh-negative mother, taken from a
--      verified report.
--
-- On (5): every flagged diagnosis is typed or picked by a clinician. Nothing in
-- this migration derives one from a value (PRD §3) — the pick lists live in the
-- application and are suggestions for the clinician's own words.
--
-- On (6): the husband's blood group is an observation like any other, with
-- test_code 'husband_blood_group'. It gets there either because the OCR read it
-- as such, or because the clinician marked a blood-group value as the husband's
-- while verifying it (save_visit_consultation_ext below).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1–2. Visits
-- ---------------------------------------------------------------------------

alter table visits
  add column chief_complaints  jsonb,
  add column exam_per_abdomen  text,
  add column exam_per_vaginum  text,
  add column exam_per_speculum text,
  add constraint visits_chief_complaints_is_array
    check (chief_complaints is null or jsonb_typeof(chief_complaints) = 'array');

comment on column visits.chief_complaints is
  'Array of {complaint, durationValue, durationUnit} as the clinician recorded them. durationUnit is DAYS, WEEKS, MONTHS or YEARS; both duration fields may be null.';

-- ---------------------------------------------------------------------------
-- 3. Pregnancies
-- ---------------------------------------------------------------------------

alter table pregnancies
  add column married_years   smallint check (married_years between 0 and 60),
  add column consanguinity   text check (consanguinity in ('CONSANGUINEOUS', 'NON_CONSANGUINEOUS')),
  add column conception_mode text check (conception_mode in ('NATURAL', 'IVF'));

comment on column pregnancies.married_years is
  'Years married, as stated at this pregnancy. A snapshot like gravida/parity, not aged forward.';

-- ---------------------------------------------------------------------------
-- 4. Menstrual history
-- ---------------------------------------------------------------------------

alter table menstrual_histories
  add column bowel_bladder text
    check (bowel_bladder in ('NORMAL', 'DYSURIA', 'DYSCHEZIA', 'DYSPAREUNIA'));

-- ---------------------------------------------------------------------------
-- 5. Flagged diagnoses
-- ---------------------------------------------------------------------------

create table flagged_diagnoses (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,
  label        text not null check (length(btrim(label)) between 1 and 200),
  -- Which cockpit section it was flagged from. Provenance only.
  section      text not null check (section in ('SCANS', 'REPORTS', 'EXAMINATION')),
  flagged_by   uuid references staff_users (id),
  flagged_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references staff_users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,

  unique (clinic_id, id),
  constraint flagged_diagnoses_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint flagged_diagnoses_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint flagged_diagnoses_resolution_complete
    check ((resolved_at is null) = (resolved_by is null))
);

-- One open flag per label per pregnancy: flagging "Anaemia" twice from two
-- sections is the same fact, not two.
create unique index flagged_diagnoses_open_label_uq
  on flagged_diagnoses (pregnancy_id, lower(btrim(label)))
  where resolved_at is null;

create index flagged_diagnoses_pregnancy_idx on flagged_diagnoses (pregnancy_id, flagged_at);

create trigger touch_flagged_diagnoses
  before update on flagged_diagnoses
  for each row execute function app.touch_row();

alter table flagged_diagnoses enable row level security;
alter table flagged_diagnoses force row level security;
create policy flagged_diagnoses_member_read on flagged_diagnoses
  for select to authenticated using (app.is_clinic_member(clinic_id));
revoke all on flagged_diagnoses from anon;

-- ---------------------------------------------------------------------------
-- flag_diagnoses — several labels at once; an already-open label is left alone
-- ---------------------------------------------------------------------------

create or replace function public.flag_diagnoses(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_section             text,
  p_labels              text[]
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_pregnancy record;
  v_label     text;
  v_id        uuid;
  v_count     integer := 0;
begin
  select * into v_pregnancy
    from pregnancies where clinic_id = p_clinic_id and id = p_pregnancy_id;
  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  foreach v_label in array p_labels loop
    v_label := btrim(v_label);
    continue when v_label = '';

    insert into flagged_diagnoses (clinic_id, patient_id, pregnancy_id, label, section, flagged_by)
    values (p_clinic_id, v_pregnancy.patient_id, p_pregnancy_id, v_label, p_section, p_actor_staff_user_id)
    on conflict (pregnancy_id, (lower(btrim(label)))) where resolved_at is null do nothing
    returning id into v_id;

    if v_id is not null then
      v_count := v_count + 1;
      insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
      values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'diagnosis.flagged', 'flagged_diagnoses', v_id,
              jsonb_build_object('pregnancy_id', p_pregnancy_id, 'label', v_label, 'section', p_section));
    end if;
    v_id := null;
  end loop;

  return v_count;
end;
$$;

create or replace function public.resolve_flagged_diagnosis(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_flag_id             uuid
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  update flagged_diagnoses
     set resolved_at = now(), resolved_by = p_actor_staff_user_id
   where clinic_id = p_clinic_id and id = p_flag_id and resolved_at is null
  returning * into v_row;

  -- Resolving twice is a no-op, not an error: two doctors clicking the same pill.
  if not found then
    return;
  end if;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'diagnosis.resolved', 'flagged_diagnoses', p_flag_id,
          jsonb_build_object('pregnancy_id', v_row.pregnancy_id, 'label', v_row.label));
end;
$$;

-- ---------------------------------------------------------------------------
-- update_pregnancy_profile — height, marriage, conception
-- ---------------------------------------------------------------------------

create or replace function public.update_pregnancy_profile(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_expected_version    integer,
  p_profile             jsonb
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
     set height_cm       = nullif(p_profile ->> 'heightCm', '')::numeric,
         married_years   = nullif(p_profile ->> 'marriedYears', '')::smallint,
         consanguinity   = nullif(p_profile ->> 'consanguinity', ''),
         conception_mode = nullif(p_profile ->> 'conceptionMode', '')
   where id = p_pregnancy_id
  returning version into v_version;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'pregnancy.profile_updated', 'pregnancies', p_pregnancy_id,
          jsonb_build_object(
            'profile', p_profile,
            'previous', jsonb_build_object(
              'height_cm', v_row.height_cm, 'married_years', v_row.married_years,
              'consanguinity', v_row.consanguinity, 'conception_mode', v_row.conception_mode)));

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_menstrual_history — 0024's routine, plus bowel_bladder
-- ---------------------------------------------------------------------------

create or replace function public.save_menstrual_history(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_history_id          uuid,
  p_expected_version    integer,
  p_recorded_on         date,
  p_entry               jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_row record;
begin
  if p_history_id is null then
    insert into menstrual_histories (clinic_id, patient_id, recorded_on, recorded_by)
    values (p_clinic_id, p_patient_id, p_recorded_on, p_actor_staff_user_id)
    returning id into v_id;
  else
    select * into v_row
      from menstrual_histories
     where clinic_id = p_clinic_id and id = p_history_id and patient_id = p_patient_id
     for update;

    if not found then
      raise exception 'Menstrual history % not found', p_history_id using errcode = 'no_data_found';
    end if;

    if v_row.version <> p_expected_version then
      raise exception 'Menstrual history % changed while it was being edited (expected version %, found %).',
        p_history_id, p_expected_version, v_row.version
        using errcode = 'serialization_failure';
    end if;

    v_id := p_history_id;
  end if;

  update menstrual_histories
     set lmp                = nullif(p_entry ->> 'lmp', '')::date,
         menarche_age_years = nullif(p_entry ->> 'menarcheAgeYears', '')::integer,
         duration_days      = nullif(p_entry ->> 'durationDays', '')::integer,
         cycle_length_days  = nullif(p_entry ->> 'cycleLengthDays', '')::integer,
         cycle_regularity   = p_entry ->> 'cycleRegularity',
         flow               = p_entry ->> 'flow',
         pads_per_day       = nullif(p_entry ->> 'padsPerDay', '')::integer,
         pms_emotional      = case when jsonb_typeof(p_entry -> 'pmsEmotional') = 'array'
                                   then array(select jsonb_array_elements_text(p_entry -> 'pmsEmotional'))
                              end,
         pms_physical       = case when jsonb_typeof(p_entry -> 'pmsPhysical') = 'array'
                                   then array(select jsonb_array_elements_text(p_entry -> 'pmsPhysical'))
                              end,
         impacts_activities = (p_entry ->> 'impactsActivities')::boolean,
         dysmenorrhea       = (p_entry ->> 'dysmenorrhea')::boolean,
         bowel_bladder      = nullif(p_entry ->> 'bowelBladder', ''),
         remarks            = nullif(btrim(coalesce(p_entry ->> 'remarks', '')), '')
   where id = v_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    case when p_history_id is null then 'menstrual_history.recorded' else 'menstrual_history.updated' end,
    'menstrual_histories', v_id,
    jsonb_build_object('patient_id', p_patient_id, 'entry', p_entry,
                       'previous', case when p_history_id is null then null else to_jsonb(v_row) end)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_visit_consultation_ext — the atomic save, plus this migration's fields
-- ---------------------------------------------------------------------------
-- A wrapper rather than a rewrite of 0024's 400-line routine: one RPC call is
-- one transaction, so the base commit and the writes below still land together
-- or not at all. A replayed save (same idempotency key) writes nothing here
-- either, exactly as the base routine writes nothing.

create or replace function public.save_visit_consultation_ext(
  p_clinic_id             uuid,
  p_actor_staff_user_id   uuid,
  p_request_id            text,
  p_visit_id              uuid,
  p_expected_version      integer,
  p_as_of_date            date,
  p_impression            text,
  p_prescriptions         jsonb,
  p_advice                jsonb,
  p_verify_candidates     jsonb,
  p_pin_observation_ids   uuid[],
  p_unpin_observation_ids uuid[],
  p_resolve_query_ids     uuid[],
  p_idempotency_key       text,
  p_payload_hash          bytea,
  p_examination           text,
  p_diagnosis             text,
  p_summary               text,
  p_reference             jsonb,
  p_extras                jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_result   jsonb;
  v_husband  uuid[];
  v_relabels integer := 0;
begin
  v_result := public.save_visit_consultation(
    p_clinic_id, p_actor_staff_user_id, p_request_id, p_visit_id, p_expected_version,
    p_as_of_date, p_impression, p_prescriptions, p_advice, p_verify_candidates,
    p_pin_observation_ids, p_unpin_observation_ids, p_resolve_query_ids,
    p_idempotency_key, p_payload_hash, p_examination, p_diagnosis, p_summary, p_reference
  );

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result;
  end if;

  update visits
     set chief_complaints  = case when jsonb_typeof(p_extras -> 'chiefComplaints') = 'array'
                                    and jsonb_array_length(p_extras -> 'chiefComplaints') > 0
                                  then p_extras -> 'chiefComplaints' end,
         exam_per_abdomen  = nullif(btrim(coalesce(p_extras ->> 'perAbdomen', '')), ''),
         exam_per_vaginum  = nullif(btrim(coalesce(p_extras ->> 'perVaginum', '')), ''),
         exam_per_speculum = nullif(btrim(coalesce(p_extras ->> 'perSpeculum', '')), '')
   where clinic_id = p_clinic_id and id = p_visit_id;

  -- Blood-group values the clinician marked as the husband's, verified in this
  -- same commit by the base routine.
  if jsonb_typeof(p_extras -> 'husbandBloodGroupCandidateIds') = 'array' then
    select array_agg(value::uuid) into v_husband
      from jsonb_array_elements_text(p_extras -> 'husbandBloodGroupCandidateIds');

    if v_husband is not null then
      update observations
         set test_code = 'husband_blood_group',
             test_name = 'Husband''s blood group'
       where clinic_id = p_clinic_id
         and source_candidate_id = any (v_husband)
         and superseded_at is null;
      get diagnostics v_relabels = row_count;
    end if;
  end if;

  return v_result || jsonb_build_object('husband_blood_group_relabelled', v_relabels);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges — service role only, as for every clinical write routine
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.flag_diagnoses(uuid, uuid, text, uuid, text, text[])',
    'public.resolve_flagged_diagnosis(uuid, uuid, text, uuid)',
    'public.update_pregnancy_profile(uuid, uuid, text, uuid, integer, jsonb)',
    'public.save_menstrual_history(uuid, uuid, text, uuid, uuid, integer, date, jsonb)',
    'public.save_visit_consultation_ext(uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea, text, text, text, jsonb, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
