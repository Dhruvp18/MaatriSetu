-- ---------------------------------------------------------------------------
-- 0019 — Transactional write routines for the voice module
-- ---------------------------------------------------------------------------
-- A patient message is the one piece of clinical content in this system that
-- arrives without a clinician present. Everything here is shaped by that:
--
--   * Association is never guessed. A message from an unrecognised number, or
--     one shared by several mothers, is stored with no patient at all and waits
--     in a staffed queue. Attaching clinical content to the wrong mother is the
--     incident this design exists to prevent.
--
--   * A failed transcription stays FAILED and keeps its reason. It is never
--     defaulted to a routing bucket, because the failure mode of defaulting is
--     a danger sign filed as routine.
--
--   * The routing bucket, the phrases that produced it and the lexicon version
--     are written together. A routing decision that cannot be explained
--     afterwards is not auditable.
--
-- These routines persist and audit. They make no authorization decisions — the
-- service has already checked membership and permission (ARCH-5).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- record_voice_note
-- ---------------------------------------------------------------------------
-- Accepts an inbound note and queues it. Returns the new id.
--
-- `p_patient_id` may be null, and usually is: staff can upload a note before
-- anyone has established whose it is.

create or replace function public.record_voice_note(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_contact_id          uuid,
  p_channel             voice_channel,
  p_provider_message_id text,
  p_from_phone_e164     text,
  p_audio_object_key    text,
  p_audio_mime_type     text,
  p_audio_duration_seconds integer
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status contact_association_status;
begin
  -- A patient is only recorded when the caller has actually established one.
  -- There is no inference from the phone number here by design.
  v_status := case when p_patient_id is not null then 'VERIFIED' else 'UNMATCHED' end;

  insert into voice_queries (
    clinic_id, patient_id, contact_id, association_status,
    channel, provider_message_id, from_phone_e164,
    audio_object_key, audio_mime_type, audio_duration_seconds,
    processing_state
  ) values (
    p_clinic_id, p_patient_id, p_contact_id, v_status,
    p_channel, p_provider_message_id, p_from_phone_e164,
    p_audio_object_key, p_audio_mime_type, p_audio_duration_seconds,
    'QUEUED'
  )
  -- A webhook redelivery is a no-op rather than a duplicate in the clinician's
  -- queue. Returns the existing row's id so the caller is none the wiser.
  on conflict (provider_message_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from voice_queries
    where provider_message_id = p_provider_message_id;

    return v_id;
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'voice_query.received', 'voice_queries', v_id,
    jsonb_build_object('channel', p_channel, 'associated', p_patient_id is not null)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_voice_transcription
-- ---------------------------------------------------------------------------
-- Written by the worker. Transcript, translation and routing land together,
-- because a transcript without its routing would sit unbucketed in a queue that
-- sorts by urgency.

create or replace function public.apply_voice_transcription(
  p_clinic_id        uuid,
  p_worker           text,
  p_request_id       text,
  p_voice_query_id   uuid,
  p_transcript       text,
  p_translation_en   text,
  p_detected_language text,
  p_confidence       numeric,
  p_provider         text,
  p_model            text,
  p_routing_bucket   query_routing_bucket,
  p_matched_phrases  text[],
  p_lexicon_version  text
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  update voice_queries
     set processing_state        = 'READY',
         processing_error        = null,
         transcript_original     = p_transcript,
         translation_en          = nullif(p_translation_en, ''),
         detected_language       = p_detected_language,
         transcription_confidence = p_confidence,
         transcript_provider     = p_provider,
         transcript_model        = p_model,
         routing_bucket          = p_routing_bucket,
         matched_phrases         = coalesce(p_matched_phrases, '{}'),
         lexicon_version         = p_lexicon_version
   where clinic_id = p_clinic_id and id = p_voice_query_id;

  if not found then
    raise exception 'Voice query % not found in clinic %', p_voice_query_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  -- Audited as a worker action, with the lexicon version, so a routing
  -- decision can be explained months later.
  insert into audit_events (
    clinic_id, actor_worker, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_worker, p_request_id,
    'voice_query.transcribed', 'voice_queries', p_voice_query_id,
    jsonb_build_object(
      'provider', p_provider,
      'model', p_model,
      'routing_bucket', p_routing_bucket,
      'matched_phrases', coalesce(p_matched_phrases, '{}'),
      'lexicon_version', p_lexicon_version
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- fail_voice_transcription
-- ---------------------------------------------------------------------------
-- A failure stays visible and keeps its reason. Deliberately does NOT set a
-- routing bucket — the column CHECK forbids it, and this is where that rule
-- earns its place: a note nobody could transcribe must not be filed as routine.

create or replace function public.fail_voice_transcription(
  p_clinic_id      uuid,
  p_worker         text,
  p_request_id     text,
  p_voice_query_id uuid,
  p_error          text
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  update voice_queries
     set processing_state = 'FAILED',
         processing_error = coalesce(nullif(btrim(p_error), ''), 'Transcription failed.'),
         routing_bucket   = null
   where clinic_id = p_clinic_id and id = p_voice_query_id;

  if not found then
    raise exception 'Voice query % not found in clinic %', p_voice_query_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  insert into audit_events (
    clinic_id, actor_worker, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_worker, p_request_id,
    'voice_query.failed', 'voice_queries', p_voice_query_id,
    jsonb_build_object('error', p_error)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- associate_voice_query
-- ---------------------------------------------------------------------------
-- A human decides whose message this is. There is no automatic path to
-- VERIFIED anywhere in this schema.

create or replace function public.associate_voice_query(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_voice_query_id      uuid,
  p_patient_id          uuid,
  p_contact_id          uuid
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_previous uuid;
begin
  select patient_id into v_previous
  from voice_queries
  where clinic_id = p_clinic_id and id = p_voice_query_id
  for update;

  if not found then
    raise exception 'Voice query % not found in clinic %', p_voice_query_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  update voice_queries
     set patient_id         = p_patient_id,
         contact_id         = p_contact_id,
         association_status = 'VERIFIED'
   where clinic_id = p_clinic_id and id = p_voice_query_id;

  -- Records the previous association too. Moving a message from one mother to
  -- another is exactly the event an audit needs to show in full.
  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'voice_query.associated', 'voice_queries', p_voice_query_id,
    jsonb_build_object('previous_patient_id', v_previous, 'patient_id', p_patient_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- acknowledge_voice_query
-- ---------------------------------------------------------------------------
-- A clinician has seen it. Distinct from resolving it, which happens inside the
-- consultation commit so that addressing a query and recording the visit cannot
-- come apart.

create or replace function public.acknowledge_voice_query(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_voice_query_id      uuid
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  update voice_queries
     set acknowledged_by = coalesce(acknowledged_by, p_actor_staff_user_id),
         acknowledged_at = coalesce(acknowledged_at, now())
   where clinic_id = p_clinic_id and id = p_voice_query_id;

  if not found then
    raise exception 'Voice query % not found in clinic %', p_voice_query_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'voice_query.acknowledged', 'voice_queries', p_voice_query_id, '{}'::jsonb
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
    'public.record_voice_note(uuid, uuid, text, uuid, uuid, voice_channel, text, text, text, text, integer)',
    'public.apply_voice_transcription(uuid, text, text, uuid, text, text, text, numeric, text, text, query_routing_bucket, text[], text)',
    'public.fail_voice_transcription(uuid, text, text, uuid, text)',
    'public.associate_voice_query(uuid, uuid, text, uuid, uuid, uuid)',
    'public.acknowledge_voice_query(uuid, uuid, text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
