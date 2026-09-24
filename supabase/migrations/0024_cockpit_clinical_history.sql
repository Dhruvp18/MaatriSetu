-- ---------------------------------------------------------------------------
-- 0024 — Cockpit clinical history
-- ---------------------------------------------------------------------------
-- The cockpit grew five things a clinician records rather than reads:
--
--   1. A detailed past obstetric history, in the shape of the paper OPD form:
--      conception, term, complications, plurality, and one row per baby.
--   2. Menstrual history, which had no home at all.
--   3. Immunizations, which had a table (0008) but no write path.
--   4. Examination, diagnosis and a consultation summary on the visit, beside
--      the existing impression. All four are clinician-authored narrative; none
--      is produced by this system (PRD §3).
--   5. A reference to another doctor, committed with the consultation.
--
-- Everything here is additive. `save_visit_consultation` gains four trailing
-- parameters with defaults, so a caller built against 0023 keeps working
-- unchanged against a database that has this migration.
--
-- "Not recorded" and "none" stay distinct throughout (ARCH-10). A complication
-- list that is NULL was never asked; an empty list is a recorded "none".
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Obstetric history detail
-- ---------------------------------------------------------------------------

alter table obstetric_history
  add column conception_mode text
    check (conception_mode in ('NATURAL', 'IVF', 'IUI', 'OTHER')),
  add column conception_remarks text,
  -- As the mother or the discharge card reports it. Free text because the
  -- paper form offers a free dropdown, and a recalled position is not a
  -- scan-verified presentation.
  add column baby_position text,
  -- NONE is the form's own option: not applicable, e.g. a first-trimester loss.
  -- NULL is "not recorded".
  add column gestation_category text
    check (gestation_category in ('FULL_TERM', 'PRE_TERM', 'POST_TERM', 'NONE')),
  add column induced_complications text[],
  add column induced_complications_remarks text,
  add column related_complications text[],
  add column related_complications_remarks text,
  add column plurality text
    check (plurality in ('SINGLE', 'TWINS', 'TRIPLETS', 'QUADRUPLETS', 'QUINTUPLETS', 'OTHER')),
  add column plurality_other text,
  add column remarks text;

alter table obstetric_history
  add constraint obstetric_history_induced_known check (
    induced_complications is null or induced_complications <@ array[
      'PRE_ECLAMPSIA', 'ECLAMPSIA', 'GESTATIONAL_DM', 'PIH', 'HYPEREMESIS'
    ]::text[]
  ),
  add constraint obstetric_history_related_known check (
    related_complications is null or related_complications <@ array[
      'PLACENTA_PREVIA', 'PLACENTAL_ABRUPTION', 'ECTOPIC', 'CMV', 'HELLP'
    ]::text[]
  ),
  -- Lets child rows carry a tenant-scoped foreign key, as every other child
  -- table in this schema does.
  add constraint obstetric_history_tenant_key unique (clinic_id, id);

comment on column obstetric_history.induced_complications is
  'Recorded history. NULL = not asked; empty array = asked, none. Never inferred.';

-- ---------------------------------------------------------------------------
-- obstetric_history_infants — one row per baby of a prior pregnancy
-- ---------------------------------------------------------------------------
-- Twins have two outcomes, two weights and two APGARs. A single set of columns
-- on the pregnancy row would force the second baby into a remarks field.

create table obstetric_history_infants (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  history_id uuid not null,

  fetus_no integer not null check (fetus_no between 1 and 9),

  outcome text check (outcome in ('ALIVE', 'STILL_BIRTH', 'NEONATAL_DEATH', 'IUFD', 'CHILD_DEATH')),
  outcome_remarks text,

  -- Date and wall-clock time as recalled or as printed on a discharge card.
  -- Kept apart so a remembered date with no time is representable.
  delivered_on   date,
  delivered_time time,

  birth_weight_grams integer check (birth_weight_grams between 200 and 7000),
  sex text check (sex in ('MALE', 'FEMALE', 'AMBIGUOUS')),

  apgar_1_min  integer check (apgar_1_min  between 0 and 10),
  apgar_5_min  integer check (apgar_5_min  between 0 and 10),
  apgar_10_min integer check (apgar_10_min between 0 and 10),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint obstetric_history_infants_history_fk
    foreign key (clinic_id, history_id) references obstetric_history (clinic_id, id) on delete restrict,
  constraint obstetric_history_infants_unique_fetus unique (history_id, fetus_no)
);

create index obstetric_history_infants_history_idx on obstetric_history_infants (history_id, fetus_no);

create trigger touch_obstetric_history_infants
  before update on obstetric_history_infants
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- 2. menstrual_histories
-- ---------------------------------------------------------------------------
-- A fact about the woman, not about one pregnancy, so keyed on the patient.
-- Rows accumulate: a history taken at booking and one retaken after a loss are
-- both part of the record, and the cockpit shows each with the date it was
-- taken.

create table menstrual_histories (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  recorded_on date not null,

  lmp                date,
  menarche_age_years integer check (menarche_age_years between 5 and 25),
  duration_days      integer check (duration_days between 1 and 20),
  cycle_length_days  integer check (cycle_length_days between 10 and 180),
  cycle_regularity   text check (cycle_regularity in ('REGULAR', 'IRREGULAR')),
  flow               text check (flow in ('SCANTY', 'MODERATE', 'HEAVY')),
  pads_per_day       integer check (pads_per_day between 0 and 30),

  -- NULL = not asked; empty = asked, none reported.
  pms_emotional text[],
  pms_physical  text[],

  -- Tri-state by nullability: true, false, or not asked.
  impacts_activities boolean,
  dysmenorrhea       boolean,

  remarks text,

  source      data_source not null default 'PATIENT_REPORTED',
  recorded_by uuid references staff_users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint menstrual_histories_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict
);

create index menstrual_histories_patient_idx on menstrual_histories (patient_id, recorded_on desc);

create trigger touch_menstrual_histories
  before update on menstrual_histories
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- 4. Visit narrative
-- ---------------------------------------------------------------------------

alter table visits
  add column examination           text,
  add column diagnosis             text,
  add column consultation_summary  text;

comment on column visits.diagnosis is
  'Clinician-authored. The system never proposes, derives or edits a diagnosis (PRD §3).';

-- ---------------------------------------------------------------------------
-- 5. doctor_references
-- ---------------------------------------------------------------------------
-- A reference to another doctor for an opinion or continued care. Distinct
-- from `referrals`, which is the emergency transfer slip with its medication
-- snapshot. Either a colleague registered at this clinic or a named external
-- doctor; never neither.

create table doctor_references (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,
  visit_id     uuid not null,

  to_staff_user_id uuid references staff_users (id),
  to_external_name text,
  to_specialty     text,
  to_facility      text,

  reason  text not null check (length(btrim(reason)) > 0),
  urgency text not null default 'ROUTINE' check (urgency in ('ROUTINE', 'URGENT')),

  created_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint doctor_references_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint doctor_references_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint doctor_references_visit_fk
    foreign key (clinic_id, visit_id) references visits (clinic_id, id) on delete restrict,
  constraint doctor_references_has_recipient check (
    to_staff_user_id is not null or length(btrim(coalesce(to_external_name, ''))) > 0
  )
);

create index doctor_references_pregnancy_idx on doctor_references (pregnancy_id, created_at desc);

create trigger touch_doctor_references
  before update on doctor_references
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- RLS — the same posture as 0012: deny by default, member-scoped read, writes
-- only through the service role.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['obstetric_history_infants', 'menstrual_histories', 'doctor_references']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (app.is_clinic_member(clinic_id))',
      t || '_member_read', t
    );
    -- 0012's blanket revoke only reached tables that existed then.
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_obstetric_history_entry
-- ---------------------------------------------------------------------------
-- Inserts a prior pregnancy (p_history_id null) or updates one, version-checked,
-- and replaces its infants. The previous infant rows are kept in the audit
-- payload: they are exactly what someone asks about when two records disagree.

create or replace function public.save_obstetric_history_entry(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_history_id          uuid,
  p_expected_version    integer,
  p_entry               jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v_row       record;
  v_sequence  integer;
  v_previous  jsonb;
  v_event     date := nullif(p_entry ->> 'eventDate', '')::date;
  v_infant    jsonb;
begin
  if p_history_id is null then
    -- Serialises concurrent inserts for one patient so sequence numbers cannot
    -- collide.
    perform 1 from patients where clinic_id = p_clinic_id and id = p_patient_id for update;
    if not found then
      raise exception 'Patient % not found in clinic %', p_patient_id, p_clinic_id
        using errcode = 'no_data_found';
    end if;

    select coalesce(max(sequence_no), 0) + 1 into v_sequence
      from obstetric_history where patient_id = p_patient_id;

    insert into obstetric_history (clinic_id, patient_id, sequence_no, source, recorded_by)
    values (
      p_clinic_id, p_patient_id, v_sequence,
      coalesce((p_entry ->> 'source')::data_source, 'PATIENT_REPORTED'),
      p_actor_staff_user_id
    )
    returning id into v_id;
  else
    select * into v_row
      from obstetric_history
     where clinic_id = p_clinic_id and id = p_history_id and patient_id = p_patient_id
     for update;

    if not found then
      raise exception 'Obstetric history entry % not found', p_history_id
        using errcode = 'no_data_found';
    end if;

    if v_row.version <> p_expected_version then
      raise exception 'Obstetric history entry % changed while it was being edited (expected version %, found %).',
        p_history_id, p_expected_version, v_row.version
        using errcode = 'serialization_failure';
    end if;

    select coalesce(jsonb_agg(to_jsonb(i) order by i.fetus_no), '[]'::jsonb) into v_previous
      from obstetric_history_infants i where i.history_id = p_history_id;

    delete from obstetric_history_infants where history_id = p_history_id;

    v_id := p_history_id;
    v_sequence := v_row.sequence_no;
  end if;

  update obstetric_history
     set event_date                    = v_event,
         event_date_precision          = case when v_event is null then 'UNKNOWN'::date_precision else 'DAY'::date_precision end,
         year_of_event                 = coalesce(extract(year from v_event)::integer,
                                                  nullif(p_entry ->> 'yearOfEvent', '')::integer),
         outcome                       = coalesce((p_entry ->> 'outcome')::pregnancy_outcome, 'UNKNOWN'),
         delivery_mode                 = coalesce((p_entry ->> 'deliveryMode')::delivery_mode, 'UNKNOWN'),
         gestation_weeks_at_delivery   = nullif(p_entry ->> 'gestationWeeksAtDelivery', '')::integer,
         has_uterine_scar              = coalesce((p_entry ->> 'hasUterineScar')::boolean, false),
         scar_indication               = nullif(btrim(coalesce(p_entry ->> 'scarIndication', '')), ''),
         place_of_event                = nullif(btrim(coalesce(p_entry ->> 'placeOfEvent', '')), ''),
         conception_mode               = p_entry ->> 'conceptionMode',
         conception_remarks            = nullif(btrim(coalesce(p_entry ->> 'conceptionRemarks', '')), ''),
         baby_position                 = nullif(btrim(coalesce(p_entry ->> 'babyPosition', '')), ''),
         gestation_category            = p_entry ->> 'gestationCategory',
         induced_complications         = case when jsonb_typeof(p_entry -> 'inducedComplications') = 'array'
                                              then array(select jsonb_array_elements_text(p_entry -> 'inducedComplications'))
                                         end,
         induced_complications_remarks = nullif(btrim(coalesce(p_entry ->> 'inducedComplicationsRemarks', '')), ''),
         related_complications         = case when jsonb_typeof(p_entry -> 'relatedComplications') = 'array'
                                              then array(select jsonb_array_elements_text(p_entry -> 'relatedComplications'))
                                         end,
         related_complications_remarks = nullif(btrim(coalesce(p_entry ->> 'relatedComplicationsRemarks', '')), ''),
         plurality                     = p_entry ->> 'plurality',
         plurality_other               = nullif(btrim(coalesce(p_entry ->> 'pluralityOther', '')), ''),
         remarks                       = nullif(btrim(coalesce(p_entry ->> 'remarks', '')), ''),
         -- A single baby's weight is mirrored onto the legacy column so the
         -- existing cockpit line and referral slip keep showing it.
         birth_weight_grams            = (
           select nullif(i ->> 'birthWeightGrams', '')::integer
             from jsonb_array_elements(coalesce(p_entry -> 'infants', '[]'::jsonb)) i
            order by (i ->> 'fetusNo')::integer
            limit 1
         )
   -- The version is bumped by app.touch_row(), which is also what makes a
   -- freshly inserted entry read back at version 2.
   where id = v_id;

  for v_infant in select * from jsonb_array_elements(coalesce(p_entry -> 'infants', '[]'::jsonb))
  loop
    insert into obstetric_history_infants (
      clinic_id, history_id, fetus_no, outcome, outcome_remarks,
      delivered_on, delivered_time, birth_weight_grams, sex,
      apgar_1_min, apgar_5_min, apgar_10_min
    ) values (
      p_clinic_id, v_id,
      (v_infant ->> 'fetusNo')::integer,
      v_infant ->> 'outcome',
      nullif(btrim(coalesce(v_infant ->> 'outcomeRemarks', '')), ''),
      nullif(v_infant ->> 'deliveredOn', '')::date,
      nullif(v_infant ->> 'deliveredTime', '')::time,
      nullif(v_infant ->> 'birthWeightGrams', '')::integer,
      v_infant ->> 'sex',
      nullif(v_infant ->> 'apgar1Min', '')::integer,
      nullif(v_infant ->> 'apgar5Min', '')::integer,
      nullif(v_infant ->> 'apgar10Min', '')::integer
    );
  end loop;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    case when p_history_id is null then 'obstetric_history.recorded' else 'obstetric_history.updated' end,
    'obstetric_history', v_id,
    jsonb_build_object(
      'patient_id', p_patient_id,
      'sequence_no', v_sequence,
      'entry', p_entry,
      'previous_infants', v_previous
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_menstrual_history
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
-- record_immunization
-- ---------------------------------------------------------------------------
-- One row per vaccine per pregnancy (0008's unique constraint), so a second
-- entry for the same vaccine updates the first rather than duplicating it. The
-- old state goes into the audit payload.

create or replace function public.record_immunization(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_vaccine             text,
  p_status              immunization_status,
  p_administered_on     date,
  p_facility            text,
  p_batch_number        text,
  p_source              data_source
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_pregnancy record;
  v_previous  jsonb;
  v_id        uuid;
begin
  select * into v_pregnancy
    from pregnancies where clinic_id = p_clinic_id and id = p_pregnancy_id;

  if not found then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  select to_jsonb(i) into v_previous
    from immunizations i
   where i.pregnancy_id = p_pregnancy_id and i.vaccine = btrim(p_vaccine);

  insert into immunizations (
    clinic_id, patient_id, pregnancy_id, vaccine, status,
    administered_on, administered_at_facility, batch_number, source, recorded_by
  ) values (
    p_clinic_id, v_pregnancy.patient_id, p_pregnancy_id, btrim(p_vaccine), p_status,
    p_administered_on, nullif(btrim(coalesce(p_facility, '')), ''),
    nullif(btrim(coalesce(p_batch_number, '')), ''), p_source, p_actor_staff_user_id
  )
  on conflict (pregnancy_id, vaccine) do update
    set status                   = excluded.status,
        administered_on          = excluded.administered_on,
        administered_at_facility = excluded.administered_at_facility,
        batch_number             = excluded.batch_number,
        source                   = excluded.source,
        recorded_by              = excluded.recorded_by,
        version                  = immunizations.version + 1
  returning id into v_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'immunization.recorded', 'immunizations', v_id,
    jsonb_build_object('pregnancy_id', p_pregnancy_id, 'vaccine', btrim(p_vaccine),
                       'status', p_status::text, 'administered_on', p_administered_on,
                       'previous', v_previous)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_visit_consultation — adds examination, diagnosis, summary, reference
-- ---------------------------------------------------------------------------
-- Dropped and recreated because Postgres cannot add parameters in place. The
-- new ones trail with defaults, so an 0023-era caller that does not send them
-- still resolves to this function through PostgREST.

drop function if exists public.save_visit_consultation(
  uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea
);

create or replace function public.save_visit_consultation(
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
  p_examination           text  default null,
  p_diagnosis             text  default null,
  p_summary               text  default null,
  p_reference             jsonb default null
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_existing        record;
  v_idempotency_id  uuid;
  v_visit           record;
  v_pregnancy       record;
  v_ga_days         integer;
  v_dating_method   dating_method;
  v_rx              jsonb;
  v_rx_id           uuid;
  v_rx_count        integer := 0;
  v_verify          jsonb;
  v_candidate       record;
  v_observation_id  uuid;
  v_verified_count  integer := 0;
  v_pin_id          uuid;
  v_pinned_count    integer := 0;
  v_unpinned_count  integer := 0;
  v_resolved_count  integer := 0;
  v_reference_id    uuid;
  v_ref_staff       uuid;
begin
  insert into idempotency_requests (
    clinic_id, actor_staff_user_id, operation, request_key, payload_hash
  ) values (
    p_clinic_id, p_actor_staff_user_id, 'visit.save_next', p_idempotency_key, p_payload_hash
  )
  on conflict (clinic_id, actor_staff_user_id, operation, request_key) do nothing
  returning id into v_idempotency_id;

  if v_idempotency_id is null then
    select * into v_existing
    from idempotency_requests
    where clinic_id = p_clinic_id
      and actor_staff_user_id = p_actor_staff_user_id
      and operation = 'visit.save_next'
      and request_key = p_idempotency_key
    for update;

    if v_existing.payload_hash is distinct from p_payload_hash then
      raise exception
        'Idempotency key % was already used with different content.', p_idempotency_key
        using errcode = 'restrict_violation';
    end if;

    if v_existing.completed_at is not null then
      return jsonb_build_object('visit_id', v_existing.response_entity_id, 'replayed', true);
    end if;

    raise exception 'An identical save is already in progress.'
      using errcode = 'serialization_failure';
  end if;

  select * into v_visit
  from visits
  where clinic_id = p_clinic_id and id = p_visit_id
  for update;

  if not found then
    raise exception 'Visit % not found in clinic %', p_visit_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_visit.status <> 'OPEN' then
    raise exception 'Visit % is already %; a saved consultation is corrected by amendment, not by saving again.',
      p_visit_id, v_visit.status
      using errcode = 'restrict_violation';
  end if;

  if v_visit.version <> p_expected_version then
    raise exception
      'Visit % changed while it was being edited (expected version %, found %).',
      p_visit_id, p_expected_version, v_visit.version
      using errcode = 'serialization_failure';
  end if;

  select * into v_pregnancy
  from pregnancies
  where clinic_id = p_clinic_id and id = v_visit.pregnancy_id;

  if v_pregnancy.dating_reference_date is not null then
    v_ga_days := v_pregnancy.dating_reference_ga_days
               + (p_as_of_date - v_pregnancy.dating_reference_date);
    v_dating_method := v_pregnancy.dating_method;
  else
    v_ga_days := null;
    v_dating_method := null;
  end if;

  update visits
     set status                 = 'SAVED',
         impression             = nullif(btrim(coalesce(p_impression, '')), ''),
         examination            = nullif(btrim(coalesce(p_examination, '')), ''),
         diagnosis              = nullif(btrim(coalesce(p_diagnosis, '')), ''),
         consultation_summary   = nullif(btrim(coalesce(p_summary, '')), ''),
         ga_days_at_visit       = v_ga_days,
         dating_method_at_visit = v_dating_method,
         clinician_id           = p_actor_staff_user_id,
         saved_at               = now(),
         saved_by               = p_actor_staff_user_id
   where clinic_id = p_clinic_id and id = p_visit_id;

  for v_rx in select * from jsonb_array_elements(coalesce(p_prescriptions, '[]'::jsonb))
  loop
    insert into prescriptions (
      clinic_id, pregnancy_id, visit_id,
      medicine_name, dose_amount, dose_unit, form, route, frequency,
      food_relation, duration_days, start_date, instructions, prescribed_by
    ) values (
      p_clinic_id, v_visit.pregnancy_id, p_visit_id,
      v_rx->>'medicineName',
      (v_rx->>'doseAmount')::numeric,
      v_rx->>'doseUnit',
      v_rx->>'form',
      coalesce((v_rx->>'route')::medication_route, 'ORAL'),
      (v_rx->>'frequency')::dose_frequency,
      coalesce((v_rx->>'foodRelation')::food_relation, 'NOT_SPECIFIED'),
      (v_rx->>'durationDays')::integer,
      p_as_of_date,
      v_rx->>'instructions',
      p_actor_staff_user_id
    )
    returning id into v_rx_id;

    v_rx_count := v_rx_count + 1;

    insert into audit_events (
      clinic_id, actor_staff_user_id, request_id,
      action, entity_table, entity_id, payload
    ) values (
      p_clinic_id, p_actor_staff_user_id, p_request_id,
      'prescription.created', 'prescriptions', v_rx_id,
      jsonb_build_object('visit_id', p_visit_id, 'medicine', v_rx->>'medicineName')
    );
  end loop;

  for v_verify in select * from jsonb_array_elements(coalesce(p_verify_candidates, '[]'::jsonb))
  loop
    select c.*, r.upload_id
      into v_candidate
      from report_candidates c
      join extraction_runs r on r.id = c.extraction_run_id
     where c.clinic_id = p_clinic_id
       and c.id = (v_verify->>'candidateId')::uuid;

    if not found then
      raise exception 'Candidate % not found in clinic %', v_verify->>'candidateId', p_clinic_id
        using errcode = 'no_data_found';
    end if;

    if v_candidate.correction_version <> (v_verify->>'correctionVersion')::integer then
      raise exception
        'Candidate % was corrected while it was being reviewed (saw version %, found %).',
        v_candidate.id, v_verify->>'correctionVersion', v_candidate.correction_version
        using errcode = 'serialization_failure';
    end if;

    insert into observations (
      clinic_id, patient_id, pregnancy_id,
      category, test_code, test_name,
      value_numeric, value_text, unit_original, unit_normalized, value_normalized,
      reference_low, reference_high, reference_text,
      observed_date, observed_date_precision,
      source, source_upload_id, source_candidate_id,
      flagged_by_clinician, clinician_note,
      verified_by
    ) values (
      p_clinic_id, v_visit.patient_id, v_visit.pregnancy_id,
      (v_verify->>'category')::observation_category,
      v_candidate.test_code,
      coalesce(v_verify->>'testName', v_candidate.printed_label),
      v_candidate.value_numeric, v_candidate.value_text,
      v_candidate.unit_original, v_candidate.unit_normalized, v_candidate.value_numeric,
      v_candidate.reference_low, v_candidate.reference_high, v_candidate.reference_text,
      coalesce(v_candidate.observed_date, p_as_of_date),
      case when v_candidate.observed_date is null then 'UNKNOWN'::date_precision else 'DAY'::date_precision end,
      'EXTRACTED_VERIFIED', v_candidate.upload_id, v_candidate.id,
      (v_verify->>'flagged')::boolean, v_verify->>'note',
      p_actor_staff_user_id
    )
    returning id into v_observation_id;

    v_verified_count := v_verified_count + 1;

    insert into audit_events (
      clinic_id, actor_staff_user_id, request_id,
      action, entity_table, entity_id, payload
    ) values (
      p_clinic_id, p_actor_staff_user_id, p_request_id,
      'observation.verified', 'observations', v_observation_id,
      jsonb_build_object('candidate_id', v_candidate.id,
                         'upload_id', v_candidate.upload_id,
                         'correction_version', v_candidate.correction_version,
                         'visit_id', p_visit_id)
    );

    if coalesce((v_verify->>'pin')::boolean, false) then
      insert into finding_pins (clinic_id, pregnancy_id, observation_id, pinned_by)
      values (p_clinic_id, v_visit.pregnancy_id, v_observation_id, p_actor_staff_user_id);

      v_pinned_count := v_pinned_count + 1;
    end if;
  end loop;

  if p_advice is not null and p_advice <> 'null'::jsonb then
    insert into visit_advice (
      clinic_id, visit_id,
      dfkc_counselled, nutrition_counselled, left_lateral_rest,
      danger_signs_counselled, lab_orders, scan_orders,
      next_followup_date, additional_advice, recorded_by
    ) values (
      p_clinic_id, p_visit_id,
      coalesce((p_advice->>'dfkcCounselled')::boolean, false),
      coalesce((p_advice->>'nutritionCounselled')::boolean, false),
      coalesce((p_advice->>'leftLateralRest')::boolean, false),
      coalesce((p_advice->>'dangerSignsCounselled')::boolean, false),
      coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_advice->'labOrders')), '{}'),
      coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_advice->'scanOrders')), '{}'),
      (p_advice->>'nextFollowupDate')::date,
      p_advice->>'additionalAdvice',
      p_actor_staff_user_id
    )
    on conflict (visit_id) do update
      set dfkc_counselled         = excluded.dfkc_counselled,
          nutrition_counselled    = excluded.nutrition_counselled,
          left_lateral_rest       = excluded.left_lateral_rest,
          danger_signs_counselled = excluded.danger_signs_counselled,
          lab_orders              = excluded.lab_orders,
          scan_orders             = excluded.scan_orders,
          next_followup_date      = excluded.next_followup_date,
          additional_advice       = excluded.additional_advice;
  end if;

  foreach v_pin_id in array coalesce(p_pin_observation_ids, '{}')
  loop
    if not exists (
      select 1 from finding_pins
      where clinic_id = p_clinic_id and observation_id = v_pin_id and unpinned_at is null
    ) then
      insert into finding_pins (clinic_id, pregnancy_id, observation_id, pinned_by)
      values (p_clinic_id, v_visit.pregnancy_id, v_pin_id, p_actor_staff_user_id);

      v_pinned_count := v_pinned_count + 1;

      insert into audit_events (
        clinic_id, actor_staff_user_id, request_id,
        action, entity_table, entity_id, payload
      ) values (
        p_clinic_id, p_actor_staff_user_id, p_request_id,
        'finding.pinned', 'observations', v_pin_id,
        jsonb_build_object('visit_id', p_visit_id)
      );
    end if;
  end loop;

  foreach v_pin_id in array coalesce(p_unpin_observation_ids, '{}')
  loop
    update finding_pins
       set unpinned_at = now(), unpinned_by = p_actor_staff_user_id
     where clinic_id = p_clinic_id and observation_id = v_pin_id and unpinned_at is null;

    if found then
      v_unpinned_count := v_unpinned_count + 1;

      insert into audit_events (
        clinic_id, actor_staff_user_id, request_id,
        action, entity_table, entity_id, payload
      ) values (
        p_clinic_id, p_actor_staff_user_id, p_request_id,
        'finding.unpinned', 'observations', v_pin_id,
        jsonb_build_object('visit_id', p_visit_id)
      );
    end if;
  end loop;

  update voice_queries
     set resolved_at          = now(),
         resolved_in_visit_id = p_visit_id,
         acknowledged_by      = coalesce(acknowledged_by, p_actor_staff_user_id),
         acknowledged_at      = coalesce(acknowledged_at, now())
   where clinic_id = p_clinic_id
     and id = any(coalesce(p_resolve_query_ids, '{}'))
     and resolved_at is null;

  get diagnostics v_resolved_count = row_count;

  insert into report_reviews (clinic_id, upload_id, visit_id, decision, reviewed_by)
  select distinct p_clinic_id, r.upload_id, p_visit_id, 'ACCEPTED'::review_decision, p_actor_staff_user_id
    from report_candidates c
    join extraction_runs r on r.id = c.extraction_run_id
   where c.clinic_id = p_clinic_id
     and c.id in (
       select (value->>'candidateId')::uuid
       from jsonb_array_elements(coalesce(p_verify_candidates, '[]'::jsonb))
     );

  -- -------------------------------------------------------------------------
  -- Reference to another doctor
  -- -------------------------------------------------------------------------
  if p_reference is not null and p_reference <> 'null'::jsonb then
    v_ref_staff := nullif(p_reference ->> 'toStaffUserId', '')::uuid;

    -- A colleague must actually be at this clinic. The service has checked it
    -- too; this keeps a stale id from another tenant out of the record.
    if v_ref_staff is not null and not exists (
      select 1 from clinic_memberships
       where clinic_id = p_clinic_id and user_id = v_ref_staff and is_active
    ) then
      raise exception 'Doctor % is not an active member of clinic %', v_ref_staff, p_clinic_id
        using errcode = 'restrict_violation';
    end if;

    insert into doctor_references (
      clinic_id, patient_id, pregnancy_id, visit_id,
      to_staff_user_id, to_external_name, to_specialty, to_facility,
      reason, urgency, created_by
    ) values (
      p_clinic_id, v_visit.patient_id, v_visit.pregnancy_id, p_visit_id,
      v_ref_staff,
      nullif(btrim(coalesce(p_reference ->> 'toExternalName', '')), ''),
      nullif(btrim(coalesce(p_reference ->> 'toSpecialty', '')), ''),
      nullif(btrim(coalesce(p_reference ->> 'toFacility', '')), ''),
      btrim(p_reference ->> 'reason'),
      coalesce(p_reference ->> 'urgency', 'ROUTINE'),
      p_actor_staff_user_id
    )
    returning id into v_reference_id;

    insert into audit_events (
      clinic_id, actor_staff_user_id, request_id,
      action, entity_table, entity_id, payload
    ) values (
      p_clinic_id, p_actor_staff_user_id, p_request_id,
      'doctor_reference.created', 'doctor_references', v_reference_id,
      jsonb_build_object('visit_id', p_visit_id, 'to_staff_user_id', v_ref_staff,
                         'to_external_name', p_reference ->> 'toExternalName')
    );
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'visit.saved', 'visits', p_visit_id,
    jsonb_build_object(
      'pregnancy_id', v_visit.pregnancy_id,
      'ga_days_at_visit', v_ga_days,
      'prescriptions', v_rx_count,
      'observations_verified', v_verified_count,
      'pinned', v_pinned_count,
      'unpinned', v_unpinned_count,
      'queries_resolved', v_resolved_count,
      'has_impression', nullif(btrim(coalesce(p_impression, '')), '') is not null,
      'has_examination', nullif(btrim(coalesce(p_examination, '')), '') is not null,
      'has_diagnosis', nullif(btrim(coalesce(p_diagnosis, '')), '') is not null,
      'reference_id', v_reference_id
    )
  );

  update idempotency_requests
     set completed_at          = now(),
         response_entity_table = 'visits',
         response_entity_id    = p_visit_id,
         response_status       = 200
   where id = v_idempotency_id;

  delete from visit_drafts where clinic_id = p_clinic_id and visit_id = p_visit_id;

  return jsonb_build_object(
    'visit_id', p_visit_id,
    'replayed', false,
    'ga_days_at_visit', v_ga_days,
    'prescriptions', v_rx_count,
    'observations_verified', v_verified_count,
    'pinned', v_pinned_count,
    'unpinned', v_unpinned_count,
    'queries_resolved', v_resolved_count
  );
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
    'public.save_obstetric_history_entry(uuid, uuid, text, uuid, uuid, integer, jsonb)',
    'public.save_menstrual_history(uuid, uuid, text, uuid, uuid, integer, date, jsonb)',
    'public.record_immunization(uuid, uuid, text, uuid, text, immunization_status, date, text, text, data_source)',
    'public.save_visit_consultation(uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea, text, text, text, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

comment on function public.save_visit_consultation is
  'The atomic Save & Next commit. Impression, examination, diagnosis, summary, orders, advice, verifications, pins, resolved queries and a doctor reference land together with their audit rows, guarded by an idempotency key and an optimistic version check.';
