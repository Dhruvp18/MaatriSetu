-- ===========================================================================
-- 0030 — family history, past history, last Pap smear
-- ===========================================================================
--   1. Family history: one row per relative and disease, as the OPD form lays
--      it out (relation, alive / deceased, disease, onset age, current age,
--      remarks). A removed row is kept, marked removed, and audited: what the
--      family history once said is itself part of the record.
--   2. Past history: her own past illnesses, one free-text record per patient
--      (typed, dictated, or built from the quick-pick list), version-checked.
--   3. Date of the last Pap smear, on the menstrual history it was asked with.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Family history
-- ---------------------------------------------------------------------------

create table family_histories (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null,
  patient_id        uuid not null,
  relation          text not null check (length(btrim(relation)) between 1 and 80),
  vital_status      text not null default 'ALIVE' check (vital_status in ('ALIVE', 'DECEASED')),
  disease           text not null check (length(btrim(disease)) between 1 and 200),
  onset_age_years   smallint check (onset_age_years between 0 and 120),
  current_age_years smallint check (current_age_years between 0 and 130),
  remarks           text,
  recorded_by       uuid references staff_users (id),
  removed_at        timestamptz,
  removed_by        uuid references staff_users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,

  unique (clinic_id, id),
  constraint family_histories_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint family_histories_removal_complete
    check ((removed_at is null) = (removed_by is null))
);

create index family_histories_patient_idx on family_histories (patient_id, created_at);

create trigger touch_family_histories
  before update on family_histories
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- 2. Past history
-- ---------------------------------------------------------------------------

create table patient_past_histories (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,
  notes      text,
  updated_by uuid references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  unique (clinic_id, patient_id),
  constraint patient_past_histories_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict
);

create trigger touch_patient_past_histories
  before update on patient_past_histories
  for each row execute function app.touch_row();

-- RLS: deny by default, member-scoped read, writes only through the routines.
do $$
declare
  t text;
begin
  foreach t in array array['family_histories', 'patient_past_histories']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (app.is_clinic_member(clinic_id))',
      t || '_member_read', t
    );
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Last Pap smear
-- ---------------------------------------------------------------------------

alter table menstrual_histories add column last_pap_smear_on date;

-- ---------------------------------------------------------------------------
-- save_family_history_entry — insert (p_entry_id null) or version-checked update
-- ---------------------------------------------------------------------------

create or replace function public.save_family_history_entry(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_entry_id            uuid,
  p_expected_version    integer,
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
  if p_entry_id is null then
    insert into family_histories (clinic_id, patient_id, relation, disease, recorded_by)
    values (p_clinic_id, p_patient_id, btrim(p_entry ->> 'relation'), btrim(p_entry ->> 'disease'), p_actor_staff_user_id)
    returning id into v_id;
  else
    select * into v_row
      from family_histories
     where clinic_id = p_clinic_id and id = p_entry_id and patient_id = p_patient_id and removed_at is null
     for update;

    if not found then
      raise exception 'Family history entry % not found', p_entry_id using errcode = 'no_data_found';
    end if;

    if v_row.version <> p_expected_version then
      raise exception 'Family history entry % changed while it was being edited (expected version %, found %).',
        p_entry_id, p_expected_version, v_row.version
        using errcode = 'serialization_failure';
    end if;

    v_id := p_entry_id;
  end if;

  update family_histories
     set relation          = btrim(p_entry ->> 'relation'),
         vital_status      = coalesce(nullif(p_entry ->> 'vitalStatus', ''), 'ALIVE'),
         disease           = btrim(p_entry ->> 'disease'),
         onset_age_years   = nullif(p_entry ->> 'onsetAgeYears', '')::smallint,
         current_age_years = nullif(p_entry ->> 'currentAgeYears', '')::smallint,
         remarks           = nullif(btrim(coalesce(p_entry ->> 'remarks', '')), '')
   where id = v_id;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    case when p_entry_id is null then 'family_history.recorded' else 'family_history.updated' end,
    'family_histories', v_id,
    jsonb_build_object('patient_id', p_patient_id, 'entry', p_entry,
                       'previous', case when p_entry_id is null then null else to_jsonb(v_row) end)
  );

  return v_id;
end;
$$;

create or replace function public.remove_family_history_entry(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_entry_id            uuid,
  p_expected_version    integer
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  select * into v_row
    from family_histories
   where clinic_id = p_clinic_id and id = p_entry_id and patient_id = p_patient_id
   for update;

  if not found then
    raise exception 'Family history entry % not found', p_entry_id using errcode = 'no_data_found';
  end if;

  -- Removing twice is a no-op.
  if v_row.removed_at is not null then
    return;
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'Family history entry % changed while it was being edited (expected version %, found %).',
      p_entry_id, p_expected_version, v_row.version
      using errcode = 'serialization_failure';
  end if;

  update family_histories
     set removed_at = now(), removed_by = p_actor_staff_user_id
   where id = p_entry_id;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'family_history.removed', 'family_histories', p_entry_id,
          jsonb_build_object('patient_id', p_patient_id, 'previous', to_jsonb(v_row)));
end;
$$;

-- ---------------------------------------------------------------------------
-- save_past_history — one record per patient; p_expected_version null creates it
-- ---------------------------------------------------------------------------

create or replace function public.save_past_history(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_expected_version    integer,
  p_notes               text
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id               uuid;
  v_current_version  integer;
  v_previous_notes   text;
  v_version          integer;
begin
  select id, version, notes into v_id, v_current_version, v_previous_notes
    from patient_past_histories
   where clinic_id = p_clinic_id and patient_id = p_patient_id
   for update;

  if v_id is null then
    if p_expected_version is not null then
      raise exception 'Past history for patient % no longer exists', p_patient_id using errcode = 'no_data_found';
    end if;

    insert into patient_past_histories (clinic_id, patient_id, notes, updated_by)
    values (p_clinic_id, p_patient_id, nullif(btrim(coalesce(p_notes, '')), ''), p_actor_staff_user_id)
    returning id, version into v_id, v_version;
  else
    -- Someone else wrote one first: a conflict, never a silent overwrite.
    if p_expected_version is null or v_current_version <> p_expected_version then
      raise exception 'Past history for patient % changed while it was being edited (expected version %, found %).',
        p_patient_id, p_expected_version, v_current_version
        using errcode = 'serialization_failure';
    end if;

    update patient_past_histories
       set notes = nullif(btrim(coalesce(p_notes, '')), ''), updated_by = p_actor_staff_user_id
     where id = v_id
    returning version into v_version;
  end if;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'past_history.saved', 'patient_past_histories', v_id,
          jsonb_build_object('patient_id', p_patient_id, 'notes', p_notes, 'previous', v_previous_notes));

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_menstrual_history — 0029's routine, plus last_pap_smear_on
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
         last_pap_smear_on  = nullif(p_entry ->> 'lastPapSmearOn', '')::date,
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
-- Privileges
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.save_family_history_entry(uuid, uuid, text, uuid, uuid, integer, jsonb)',
    'public.remove_family_history_entry(uuid, uuid, text, uuid, uuid, integer)',
    'public.save_past_history(uuid, uuid, text, uuid, integer, text)',
    'public.save_menstrual_history(uuid, uuid, text, uuid, uuid, integer, date, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
