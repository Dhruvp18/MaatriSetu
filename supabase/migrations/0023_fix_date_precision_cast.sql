-- ---------------------------------------------------------------------------
-- 0023 — Fix the date_precision casts in the ingestion routines
-- ---------------------------------------------------------------------------
-- Three expressions in 0022 wrote a precision like this:
--
--     case when <something> is null then 'UNKNOWN' else 'DAY' end
--
-- PostgreSQL resolves a CASE from its own branches before it considers where
-- the value is going. Both branches are unknown-typed literals, so the CASE
-- becomes `text`, and there is no implicit cast from text to an enum. Every one
-- of them fails at runtime with:
--
--     column "observed_date_precision" is of type date_precision
--     but expression is of type text
--
-- All three are on the OCR path, and none of them had a caller when 0022
-- landed: `pnpm verify:schema` applies the migrations and the seed, neither of
-- which invokes these routines, so a clean schema check said nothing about
-- them. The failure surfaced the first time `tools/check-pages.mjs` drove a
-- real extraction through `complete_extraction_run`, which is the argument for
-- that script existing.
--
-- The third occurrence is the serious one. It sits inside
-- `save_visit_consultation`, in the INSERT that turns a verified candidate into
-- an observation — so clinician verification would have failed on every
-- consultation that included a lab value, and taken the whole atomic save down
-- with it.
--
-- The functions below are 0022's, unchanged apart from casting each literal to
-- `date_precision`. plpgsql has no way to patch one expression, so the whole
-- body is restated; `create or replace` keeps privileges and the drop in 0022
-- is not repeated because the signature is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.complete_extraction_run(
  p_clinic_id  uuid,
  p_worker     text,
  p_request_id text,
  p_run_id     uuid,
  p_raw_output jsonb,
  p_report_type report_type,
  p_candidates jsonb
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_candidate jsonb;
  v_count     integer := 0;
  v_upload_id uuid;
begin
  select upload_id into v_upload_id
  from extraction_runs
  where clinic_id = p_clinic_id and id = p_run_id;

  if not found then
    raise exception 'Extraction run % not found in clinic %', p_run_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  update extraction_runs
     set status               = 'READY_FOR_REVIEW',
         raw_output           = p_raw_output,
         detected_report_type = p_report_type,
         completed_at         = now()
   where clinic_id = p_clinic_id and id = p_run_id;

  for v_candidate in select * from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    insert into report_candidates (
      clinic_id, extraction_run_id, test_code, printed_label,
      value_numeric, value_text, unit_original, unit_normalized,
      reference_low, reference_high, reference_text,
      observed_date, observed_date_precision, confidence
    ) values (
      p_clinic_id, p_run_id,
      -- A field the model could not map still arrives for review under its
      -- printed label; dropping it would hide a result from the clinician.
      coalesce(v_candidate->>'testCode', 'unmapped'),
      v_candidate->>'printedLabel',
      (v_candidate->>'valueNumeric')::numeric,
      v_candidate->>'valueText',
      v_candidate->>'unit',
      -- Normalisation is a later concern; the printed unit is what was read,
      -- and it is never invented here.
      v_candidate->>'unit',
      (v_candidate->>'referenceLow')::numeric,
      (v_candidate->>'referenceHigh')::numeric,
      v_candidate->>'referenceText',
      (v_candidate->>'observedDate')::date,
      case when v_candidate->>'observedDate' is null then 'UNKNOWN'::date_precision else 'DAY'::date_precision end,
      (v_candidate->>'confidence')::numeric
    );

    v_count := v_count + 1;
  end loop;

  insert into audit_events (
    clinic_id, actor_worker, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_worker, p_request_id,
    'extraction.completed', 'extraction_runs', p_run_id,
    jsonb_build_object('upload_id', v_upload_id, 'candidates', v_count,
                       'report_type', p_report_type)
  );

  return v_count;
end;
$$;

create or replace function public.correct_report_candidate(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_candidate_id        uuid,
  p_value_numeric       numeric,
  p_value_text          text,
  p_unit                text,
  p_observed_date       date,
  p_discard             boolean
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_version integer;
begin
  update report_candidates
     set value_numeric   = p_value_numeric,
         value_text      = p_value_text,
         unit_original   = p_unit,
         unit_normalized = p_unit,
         observed_date   = p_observed_date,
         observed_date_precision = case when p_observed_date is null then 'UNKNOWN'::date_precision else 'DAY'::date_precision end,
         correction_version = correction_version + 1,
         corrected_by    = p_actor_staff_user_id,
         corrected_at    = now(),
         -- Discarding is reversible and recorded, not a delete: a row an
         -- assistant threw away is itself worth being able to look at.
         discarded_at    = case when p_discard then now() else null end
   where clinic_id = p_clinic_id and id = p_candidate_id
  returning correction_version into v_version;

  if not found then
    raise exception 'Candidate % not found in clinic %', p_candidate_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'report_candidate.corrected', 'report_candidates', p_candidate_id,
    jsonb_build_object('version', v_version, 'discarded', p_discard)
  );

  return v_version;
end;
$$;

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
  p_payload_hash          bytea
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

  -- -------------------------------------------------------------------------
  -- Verification: candidates become observations, here and nowhere else
  -- -------------------------------------------------------------------------
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

    -- The clinician verified a specific version of this value. If an assistant
    -- corrected it in between, what they approved is not what would be stored,
    -- so the save is rejected rather than silently writing the newer number.
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
      -- Clinician-entered, and null unless they actually flagged it. Nothing
      -- here derives it from the reference range (PRD §3).
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
      -- A slip with no readable date is dated to the consultation, and said so
      -- by the precision column rather than by pretending to know.
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

    -- A value the clinician chose to surface is pinned in the same breath.
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

  -- The clinician's decision on each upload, recorded once per review. This is
  -- what empties the New Reports strip as the consultation proceeds, rather
  -- than re-offering slips that were just verified.
  --
  -- A row in `report_reviews`, not a status column on the upload: the decision
  -- has a reviewer and a time, and 0006 deliberately kept the immutable
  -- document separate from what a clinician concluded about it.
  insert into report_reviews (clinic_id, upload_id, visit_id, decision, reviewed_by)
  select distinct p_clinic_id, r.upload_id, p_visit_id, 'ACCEPTED'::review_decision, p_actor_staff_user_id
    from report_candidates c
    join extraction_runs r on r.id = c.extraction_run_id
   where c.clinic_id = p_clinic_id
     and c.id in (
       select (value->>'candidateId')::uuid
       from jsonb_array_elements(coalesce(p_verify_candidates, '[]'::jsonb))
     );

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
      'has_impression', nullif(btrim(coalesce(p_impression, '')), '') is not null
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
-- `create or replace` preserves existing grants, so these are restated only so
-- that a database built from scratch by this migration set ends up identical to
-- one that was upgraded through it.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.complete_extraction_run(uuid, text, text, uuid, jsonb, report_type, jsonb)',
    'public.correct_report_candidate(uuid, uuid, text, uuid, numeric, text, text, date, boolean)',
    'public.save_visit_consultation(uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
