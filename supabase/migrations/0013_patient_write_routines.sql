-- ---------------------------------------------------------------------------
-- 0013 — Transactional write routines for the patients module
-- ---------------------------------------------------------------------------
-- Registering a mother touches four tables: patients, patient_allergies,
-- patient_contacts and audit_events. Supabase's REST client has no way to span
-- those in one transaction, so four separate calls would make two failure modes
-- reachable:
--
--   * a patient row exists with none of her contacts, so the number the clinic
--     would ring is silently absent rather than visibly unknown;
--   * a clinical write lands with no audit row, which migration 0012 explicitly
--     promises cannot happen ("audit rows are written by the service role
--     inside the same transaction as the clinical write, so an application bug
--     cannot produce a clinical write with no audit trail").
--
-- These routines keep that promise. They persist and audit; they do NOT make
-- authorization decisions — the service layer has already checked membership
-- and permission before calling (ARCH-5), and passes the acting staff user in.
--
-- They live in `public` rather than `app` because, unlike the helpers in 0001,
-- they are a deliberate API surface: PostgREST only exposes `public`. Execute
-- is revoked from anon and authenticated at the foot of this file, so only the
-- service role — which the browser never holds — can call them.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- register_patient
-- ---------------------------------------------------------------------------
-- Allergies and contacts arrive as JSON arrays already validated by
-- RegisterPatientSchema (ARCH-6). Phone numbers arrive normalized to E.164;
-- the CHECK on patient_contacts is the backstop, not the rule.
--
-- Contacts are created UNVERIFIED on purpose. Verification gates inbound voice
-- matching, and "a nurse typed this number at the counter" is not the same
-- claim as "we confirmed this handset reaches this mother". Verifying is a
-- separate, audited act.

create or replace function public.register_patient(
  p_clinic_id             uuid,
  p_actor_staff_user_id   uuid,
  p_request_id            text,
  p_uhid                  text,
  p_full_name             text,
  p_date_of_birth         date,
  p_estimated_age_years   integer,
  p_age_recorded_on       date,
  p_abha_id               text,
  p_abha_verification     abha_verification,
  p_allergy_status        known_status,
  p_blood_group           blood_group,
  p_blood_group_source    data_source,
  p_blood_group_recorded_on date,
  p_allergies             jsonb,
  p_contacts              jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_patient_id uuid;
  v_allergies  jsonb := coalesce(p_allergies, '[]'::jsonb);
  v_contacts   jsonb := coalesce(p_contacts,  '[]'::jsonb);
begin
  insert into patients (
    clinic_id, uhid, full_name,
    date_of_birth, estimated_age_years, age_recorded_on,
    abha_id, abha_verification,
    allergy_status,
    blood_group, blood_group_source, blood_group_recorded_on,
    created_by
  ) values (
    p_clinic_id, p_uhid, p_full_name,
    p_date_of_birth, p_estimated_age_years, p_age_recorded_on,
    p_abha_id, p_abha_verification,
    p_allergy_status,
    p_blood_group, p_blood_group_source, p_blood_group_recorded_on,
    p_actor_staff_user_id
  )
  returning id into v_patient_id;

  insert into patient_allergies (
    clinic_id, patient_id, substance, reaction, severity, source, recorded_by
  )
  select
    p_clinic_id,
    v_patient_id,
    a ->> 'substance',
    nullif(btrim(coalesce(a ->> 'reaction', '')), ''),
    (a ->> 'severity')::allergy_severity,
    (a ->> 'source')::data_source,
    p_actor_staff_user_id
  from jsonb_array_elements(v_allergies) as a;

  insert into patient_contacts (
    clinic_id, patient_id, phone_e164, relationship, contact_name,
    is_primary, messaging_consent_at
  )
  select
    p_clinic_id,
    v_patient_id,
    c ->> 'phone',
    (c ->> 'relationship')::contact_relationship,
    nullif(btrim(coalesce(c ->> 'contactName', '')), ''),
    coalesce((c ->> 'isPrimary')::boolean, false),
    -- Consent is an event with a time, not a flag. Recording when it was given
    -- is what makes a later withdrawal orderable against it.
    case when coalesce((c ->> 'hasMessagingConsent')::boolean, false) then now() end
  from jsonb_array_elements(v_contacts) as c;

  -- Counts and states, not a copy of her record. The audit trail answers "who
  -- registered whom, when, and what was claimed about allergies"; the record
  -- itself is the place to read her details.
  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'patient.registered', 'patients', v_patient_id,
    jsonb_build_object(
      'uhid',              p_uhid,
      'allergy_status',    p_allergy_status::text,
      'allergy_count',     jsonb_array_length(v_allergies),
      'contact_count',     jsonb_array_length(v_contacts),
      'blood_group_recorded', p_blood_group is not null,
      'abha_verification', p_abha_verification::text
    )
  );

  return v_patient_id;
end;
$$;

comment on function public.register_patient is
  'Atomically creates a patient with her allergies, contacts and registration audit row. Performs no authorization; the caller must already have checked membership and patient.register.';

-- ---------------------------------------------------------------------------
-- issue_patient_qr
-- ---------------------------------------------------------------------------
-- The sticker token is random and is hashed before it ever reaches the
-- database, so this function receives hex and never sees the raw value. A
-- reissue overwrites the hash, which retires the previous sticker — one live
-- sticker per file, so a photocopied page cannot quietly keep working.

create or replace function public.issue_patient_qr(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_token_hash          text
)
returns timestamptz
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_issued_at timestamptz;
  v_reissue   boolean;
begin
  select (qr_token_hash is not null and qr_token_revoked_at is null)
    into v_reissue
  from patients
  where clinic_id = p_clinic_id and id = p_patient_id
  for update;

  if not found then
    raise exception 'Patient % not found in clinic %', p_patient_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  update patients
     set qr_token_hash       = decode(p_token_hash, 'hex'),
         qr_token_issued_at  = now(),
         qr_token_revoked_at = null
   where clinic_id = p_clinic_id and id = p_patient_id
  returning qr_token_issued_at into v_issued_at;

  -- The hash is deliberately absent from the payload. An audit trail that
  -- records the lookup key is a second copy of the lookup key.
  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'patient.qr_issued', 'patients', p_patient_id,
    jsonb_build_object('reissue', coalesce(v_reissue, false))
  );

  return v_issued_at;
end;
$$;

comment on function public.issue_patient_qr is
  'Stores the SHA-256 hash of a freshly minted sticker token and audits the issue. The raw token is never passed in and never stored.';

-- ---------------------------------------------------------------------------
-- revoke_patient_qr
-- ---------------------------------------------------------------------------
-- A lost file is a lost lookup key, not a lost identity. Revoking retires the
-- sticker without touching the patient, so her record and her history survive.

create or replace function public.revoke_patient_qr(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_reason              text
)
returns boolean
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_revoked boolean := false;
begin
  update patients
     set qr_token_revoked_at = now()
   where clinic_id = p_clinic_id
     and id = p_patient_id
     and qr_token_hash is not null
     and qr_token_revoked_at is null;

  v_revoked := found;

  if not v_revoked then
    -- Either there is no patient, or there was no live sticker to retire.
    -- Both are a no-op for the caller; neither is worth an audit row.
    return false;
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'patient.qr_revoked', 'patients', p_patient_id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- find_patient_by_qr
-- ---------------------------------------------------------------------------
-- Scanning a sticker is how the cockpit is opened, so every successful scan is
-- recorded: if a file is later found in the wrong hands, the question asked is
-- "who scanned it and when", and that answer has to already exist.
--
-- A scan that matches nothing writes no audit row and is indistinguishable, to
-- the caller, from a sticker belonging to another clinic. Returning null rather
-- than an error keeps a scanned token from being used to probe for valid ones.

create or replace function public.find_patient_by_qr(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_token_hash          text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_patient_id uuid;
begin
  select id into v_patient_id
  from patients
  where clinic_id = p_clinic_id
    and qr_token_hash = decode(p_token_hash, 'hex')
    and qr_token_revoked_at is null;

  if v_patient_id is null then
    return null;
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'patient.qr_scanned', 'patients', v_patient_id,
    '{}'::jsonb
  );

  return v_patient_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Functions in `public` are executable by PUBLIC unless revoked. These write
-- clinical rows and audit rows, so only the service role may call them — and
-- the service role reaches them by bypassing RLS, never through a browser.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.register_patient(uuid, uuid, text, text, text, date, integer, date, text, abha_verification, known_status, blood_group, data_source, date, jsonb, jsonb)',
    'public.issue_patient_qr(uuid, uuid, text, uuid, text)',
    'public.revoke_patient_qr(uuid, uuid, text, uuid, text)',
    'public.find_patient_by_qr(uuid, uuid, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
