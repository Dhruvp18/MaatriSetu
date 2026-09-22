-- ---------------------------------------------------------------------------
-- 0018 — The atomic consultation commit
-- ---------------------------------------------------------------------------
-- Save & Next is the one write in this system that must be all-or-nothing. A
-- consultation is an impression, a set of orders, advice, a follow-up date, the
-- findings the clinician chose to surface and the queries they addressed. Half
-- of that on the record is worse than none of it: orders with no impression
-- read as a prescription nobody reasoned about, and an impression with no
-- orders reads as a decision that was never acted on.
--
-- PRD §9 originally exposed independent pin and resolve endpoints alongside an
-- atomic save. Those cannot both be true — writes landing before the save would
-- survive a failed save. Everything therefore arrives here together.
--
-- IDEMPOTENCY
-- -----------
-- At two minutes a patient on hospital wifi, a double-clicked Save and a retry
-- after a timeout that actually succeeded are routine. The first request
-- claims the key; a repeat with the same payload returns the original result
-- rather than committing a second time. A repeat with a DIFFERENT payload is
-- rejected outright — silently applying it would mean one clinician's save
-- quietly replaced another's.
--
-- CONCURRENCY
-- -----------
-- The visit row is locked and its version checked. A mismatch raises
-- serialization_failure, which the repository maps to 409 so the UI refreshes
-- and reconciles. It must never discard the clinician's draft.
--
-- This routine persists and audits. It makes no authorization decisions — the
-- service has already checked membership and permission (ARCH-5).
-- ---------------------------------------------------------------------------

create or replace function public.save_visit_consultation(
  p_clinic_id             uuid,
  p_actor_staff_user_id   uuid,
  p_request_id            text,
  p_visit_id              uuid,
  p_expected_version      integer,
  -- The clinic's calendar day, supplied by the caller. Gestational age is a
  -- calendar computation and the server's UTC clock is the wrong one (0004).
  p_as_of_date            date,
  p_impression            text,
  p_prescriptions         jsonb,
  p_advice                jsonb,
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
  v_pin_id          uuid;
  v_pinned_count    integer := 0;
  v_unpinned_count  integer := 0;
  v_resolved_count  integer := 0;
begin
  -- -------------------------------------------------------------------------
  -- 1. Claim the idempotency key
  -- -------------------------------------------------------------------------
  -- Inserted first so that two concurrent identical requests race here, on a
  -- unique index, rather than both proceeding to write clinical rows.
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

    -- Same key, different content. Applying it would let one save silently
    -- overwrite another; refusing sends the caller back with a clear error.
    if v_existing.payload_hash is distinct from p_payload_hash then
      raise exception
        'Idempotency key % was already used with different content.', p_idempotency_key
        using errcode = 'restrict_violation';
    end if;

    if v_existing.completed_at is not null then
      return jsonb_build_object(
        'visit_id', v_existing.response_entity_id,
        'replayed', true
      );
    end if;

    -- Claimed but unfinished: a genuine concurrent duplicate. Retryable.
    raise exception 'An identical save is already in progress.'
      using errcode = 'serialization_failure';
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Lock the visit and check it is still the one the clinician edited
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- 3. Freeze the gestational age
  -- -------------------------------------------------------------------------
  -- Recorded once, here, and never recomputed. A later redating must not
  -- rewrite the number this consultation was reasoned from (0005).
  select * into v_pregnancy
  from pregnancies
  where clinic_id = p_clinic_id and id = v_visit.pregnancy_id;

  if v_pregnancy.dating_reference_date is not null then
    v_ga_days := v_pregnancy.dating_reference_ga_days
               + (p_as_of_date - v_pregnancy.dating_reference_date);
    v_dating_method := v_pregnancy.dating_method;
  else
    -- Dating not established. Null here means exactly that, and the saved
    -- summary will say so rather than showing a gestation nobody recorded.
    v_ga_days := null;
    v_dating_method := null;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. The visit itself
  -- -------------------------------------------------------------------------
  update visits
     set status                 = 'SAVED',
         impression             = nullif(btrim(coalesce(p_impression, '')), ''),
         ga_days_at_visit       = v_ga_days,
         dating_method_at_visit = v_dating_method,
         clinician_id           = p_actor_staff_user_id,
         saved_at               = now(),
         saved_by               = p_actor_staff_user_id
   where clinic_id = p_clinic_id and id = p_visit_id;

  -- -------------------------------------------------------------------------
  -- 5. Prescriptions
  -- -------------------------------------------------------------------------
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
  -- 6. Advice and follow-up
  -- -------------------------------------------------------------------------
  -- One row per visit. Saving twice is impossible (the visit is now SAVED), but
  -- the upsert keeps the constraint honest rather than relying on that.
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
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_advice->'labOrders')),
        '{}'
      ),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_advice->'scanOrders')),
        '{}'
      ),
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

  -- -------------------------------------------------------------------------
  -- 7. Pin decisions
  -- -------------------------------------------------------------------------
  -- Display preference, not verification. Every pin and unpin is audited
  -- individually: PRD F11 requires the record to show who surfaced what, and
  -- when.
  foreach v_pin_id in array coalesce(p_pin_observation_ids, '{}')
  loop
    -- Pinning something already pinned is a no-op, not an error: the clinician
    -- ticked a box that was already ticked.
    if not exists (
      select 1 from finding_pins
      where clinic_id = p_clinic_id
        and observation_id = v_pin_id
        and unpinned_at is null
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
       set unpinned_at = now(),
           unpinned_by = p_actor_staff_user_id
     where clinic_id = p_clinic_id
       and observation_id = v_pin_id
       and unpinned_at is null;

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

  -- -------------------------------------------------------------------------
  -- 8. Patient queries addressed during this consultation
  -- -------------------------------------------------------------------------
  update voice_queries
     set resolved_at          = now(),
         resolved_in_visit_id = p_visit_id,
         acknowledged_by      = coalesce(acknowledged_by, p_actor_staff_user_id),
         acknowledged_at      = coalesce(acknowledged_at, now())
   where clinic_id = p_clinic_id
     and id = any(coalesce(p_resolve_query_ids, '{}'))
     and resolved_at is null;

  get diagnostics v_resolved_count = row_count;

  -- -------------------------------------------------------------------------
  -- 9. The consultation itself
  -- -------------------------------------------------------------------------
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
      'pinned', v_pinned_count,
      'unpinned', v_unpinned_count,
      'queries_resolved', v_resolved_count,
      'has_impression', nullif(btrim(coalesce(p_impression, '')), '') is not null
    )
  );

  -- -------------------------------------------------------------------------
  -- 10. Mark the key complete
  -- -------------------------------------------------------------------------
  -- Last, inside the same transaction: if anything above rolls back, the key is
  -- released with it and an honest retry can succeed.
  update idempotency_requests
     set completed_at          = now(),
         response_entity_table = 'visits',
         response_entity_id    = p_visit_id,
         response_status       = 200
   where id = v_idempotency_id;

  -- A draft is one clinician's unfinished thinking and never a clinical
  -- record. Once the consultation is committed there is nothing left to resume.
  delete from visit_drafts where clinic_id = p_clinic_id and visit_id = p_visit_id;

  return jsonb_build_object(
    'visit_id', p_visit_id,
    'replayed', false,
    'ga_days_at_visit', v_ga_days,
    'prescriptions', v_rx_count,
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
  fn text := 'public.save_visit_consultation(uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea)';
begin
  execute format('revoke all on function %s from public, anon, authenticated', fn);
  execute format('grant execute on function %s to service_role', fn);
end;
$$;

comment on function public.save_visit_consultation is
  'The atomic Save & Next commit. Impression, orders, advice, pins and resolved queries land together with their audit rows, guarded by an idempotency key and an optimistic version check.';
