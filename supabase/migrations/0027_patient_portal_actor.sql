-- ---------------------------------------------------------------------------
-- 0027 — The patient portal as an audited actor
-- ---------------------------------------------------------------------------
-- Two routines are reached from the patient's own phone, where there is no
-- staff user: resolving the QR sticker on her file, and uploading a photograph
-- of her own report.
--
-- Both audit, and `audit_events_has_one_actor` (0011) demands exactly one of a
-- staff user or a worker. The portal used to pass an all-zero staff id, which
-- fails the staff_users foreign key — so every real QR scan errored.
--
-- A null staff id now means "the patient, through the portal", recorded as
-- `actor_worker = 'patient-portal'`. Signatures are unchanged, so existing
-- grants (service role only) carry over.
-- ---------------------------------------------------------------------------

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
    clinic_id, actor_staff_user_id, actor_worker, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id,
    case when p_actor_staff_user_id is null then 'patient-portal' end,
    p_request_id,
    'patient.qr_scanned', 'patients', v_patient_id,
    '{}'::jsonb
  );

  return v_patient_id;
end;
$$;

create or replace function public.record_report_upload(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_pregnancy_id        uuid,
  p_visit_id            uuid,
  p_object_key          text,
  p_content_type        text,
  p_byte_size           integer,
  p_sha256              bytea
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_status upload_assignment_status;
begin
  v_status := case when p_pregnancy_id is not null then 'ASSIGNED' else 'UNASSIGNED' end;

  insert into report_uploads (
    clinic_id, patient_id, pregnancy_id, visit_id,
    object_key, content_type, byte_size, sha256,
    assignment_status, uploaded_by
  ) values (
    p_clinic_id, p_patient_id, p_pregnancy_id, p_visit_id,
    p_object_key, p_content_type, p_byte_size, p_sha256,
    v_status, p_actor_staff_user_id
  )
  returning id into v_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, actor_worker, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id,
    case when p_actor_staff_user_id is null then 'patient-portal' end,
    p_request_id,
    'report_upload.received', 'report_uploads', v_id,
    jsonb_build_object('assigned', p_pregnancy_id is not null, 'bytes', p_byte_size)
  );

  return v_id;
end;
$$;
