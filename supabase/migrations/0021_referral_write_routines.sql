-- ---------------------------------------------------------------------------
-- 0021 — Transactional write routines for the referrals module
-- ---------------------------------------------------------------------------
-- A referral is the one document this system produces that is read by someone
-- with no account, no context and no way to ask a follow-up question. Every
-- decision below follows from that.
--
-- THE DOCUMENT IS FROZEN, NOT ASSEMBLED ON DEMAND
-- -----------------------------------------------
-- `issue_referral` reads the mother's record and writes the complete handover
-- document into `referrals.issued_snapshot` inside the issuing transaction.
-- The printed slip and the tokenized page then render from that one blob, so
-- they cannot disagree — a printed page contradicting the QR code stapled next
-- to it is worse than having neither. It also means a correction made to her
-- record at 09:00 does not silently rewrite what a receiving unit was handed at
-- 02:00. The trigger in 0010 enforces the freeze; this routine is what fills it.
--
-- A CORRECTION IS A NEW REFERRAL
-- ------------------------------
-- There is deliberately no "edit issued referral" routine. `supersedes_id` is
-- set while the replacement is still a draft, and the superseded row only flips
-- to SUPERSEDED when the replacement is actually issued — until that moment the
-- original is still the live document travelling with the patient.
--
-- ISSUING MINTS NOTHING
-- ---------------------
-- `issue_referral` creates no access token. The two acts are separated because
-- a raw token exists exactly once, in the response that mints it: folding it
-- into the issue call would mean a lost or re-rendered response silently
-- discards a link that can never be recovered. It also keeps a paper-only
-- handover — the common case in a power cut — from minting a live URL nobody
-- asked for.
--
-- PRE-REFERRAL DOSES COME FROM WHAT WAS GIVEN
-- -------------------------------------------
-- The snapshot reads `medication_administrations`, never `prescriptions`. An
-- order is a decision; an administration is an event with a mandatory
-- timestamp. The receiving unit's question is "how long ago did she have
-- magnesium sulphate", and only the second table can answer it. This is the
-- single most load-bearing line in the file.
--
-- UNKNOWN IS WRITTEN DOWN
-- -----------------------
-- Every field that can be unknown is encoded as a tagged object rather than
-- omitted or nulled (ARCH-10). A blank next to "Blood group" on a slip read at
-- 2 AM is indistinguishable from a negative finding, and the whole product
-- exists to stop that.
--
-- These routines persist and audit in one transaction. They make NO
-- authorization decisions — the service has already checked membership and
-- permission (ARCH-5) and passes the acting staff user in.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- create_referral_draft
-- ---------------------------------------------------------------------------
-- Deliberately minimal. A referral is started while someone is deteriorating,
-- so the draft exists after the two facts that are always known — who she is
-- and why she is going — and everything else is filled in by
-- `update_referral_draft` as it becomes available.
--
-- `p_origin_visit_id` is nullable and usually null: a patient crashing at 2 AM
-- is not inside an OPD visit, and making the referral wait on opening one would
-- put paperwork between a clinician and a transfer.
--
-- The patient is DERIVED from the pregnancy rather than passed in. The
-- composite foreign keys guarantee that both belong to this clinic, but nothing
-- would tie them to each other — a caller that mixed up two arguments would
-- file a referral against the wrong mother, and that is not a mistake a
-- handover document can survive.

create or replace function public.create_referral_draft(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pregnancy_id        uuid,
  p_origin_visit_id     uuid,
  -- The referral this one is being written to replace, if any. Set now, acted
  -- on at issue: the original stays live until the replacement exists.
  p_supersedes_id       uuid,
  p_indication          text,
  p_receiving_facility  text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_referral_id uuid;
  v_patient_id  uuid;
  v_superseded  record;
  v_visit_pregnancy_id uuid;
begin
  select patient_id into v_patient_id
  from pregnancies
  where clinic_id = p_clinic_id and id = p_pregnancy_id;

  if v_patient_id is null then
    raise exception 'Pregnancy % not found in clinic %', p_pregnancy_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if p_origin_visit_id is not null then
    select pregnancy_id into v_visit_pregnancy_id
    from visits
    where clinic_id = p_clinic_id and id = p_origin_visit_id;

    -- A referral attributed to a consultation from a different episode would
    -- put this transfer in the wrong pregnancy's timeline.
    if v_visit_pregnancy_id is distinct from p_pregnancy_id then
      raise exception 'Visit % does not belong to pregnancy %', p_origin_visit_id, p_pregnancy_id
        using errcode = 'restrict_violation';
    end if;
  end if;

  if p_supersedes_id is not null then
    select id, status, pregnancy_id into v_superseded
    from referrals
    where clinic_id = p_clinic_id and id = p_supersedes_id;

    if not found then
      raise exception 'Referral % not found in clinic %', p_supersedes_id, p_clinic_id
        using errcode = 'no_data_found';
    end if;

    -- A correction replaces a document about the same episode. Anything else is
    -- a new referral, not a supersession.
    if v_superseded.pregnancy_id <> p_pregnancy_id then
      raise exception 'Referral % belongs to a different pregnancy.', p_supersedes_id
        using errcode = 'restrict_violation';
    end if;

    -- Only an issued document can be superseded. Replacing a draft means
    -- editing it, and replacing a cancelled one means starting fresh; treating
    -- either as a supersession would put a chain in the record that describes
    -- something that never happened.
    if v_superseded.status <> 'ISSUED' then
      raise exception
        'Referral % is %; only an issued referral can be superseded.',
        p_supersedes_id, v_superseded.status
        using errcode = 'restrict_violation';
    end if;
  end if;

  insert into referrals (
    clinic_id, patient_id, pregnancy_id, origin_visit_id,
    supersedes_id, indication, receiving_facility, created_by
  ) values (
    p_clinic_id, v_patient_id, p_pregnancy_id, p_origin_visit_id,
    p_supersedes_id,
    nullif(btrim(coalesce(p_indication, '')), ''),
    nullif(btrim(coalesce(p_receiving_facility, '')), ''),
    p_actor_staff_user_id
  )
  returning id into v_referral_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'referral.draft_created', 'referrals', v_referral_id,
    jsonb_build_object(
      'patient_id', v_patient_id,
      'pregnancy_id', p_pregnancy_id,
      'origin_visit_id', p_origin_visit_id,
      'supersedes_id', p_supersedes_id
    )
  );

  return v_referral_id;
end;
$$;

comment on function public.create_referral_draft is
  'Starts an emergency referral draft. Independent of any visit: a patient being transferred at 2 AM is not inside a consultation.';

-- ---------------------------------------------------------------------------
-- update_referral_draft
-- ---------------------------------------------------------------------------
-- A whole-document replace rather than a patch, matched with an optimistic
-- version check. A partial update plus a version check is ambiguous — an
-- omitted field could mean "leave it" or "clear it", and on a handover slip
-- those differ by a cleared allergy line. The form posts the entire draft every
-- time, so "what was sent is what the document says" needs no interpretation.
--
-- Only a DRAFT is writable. The guard in 0010 already refuses to touch a frozen
-- snapshot; this refuses earlier and with a sentence a clinician can act on.

create or replace function public.update_referral_draft(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_referral_id         uuid,
  p_expected_version    integer,

  p_referring_facility      text,
  p_referring_doctor_name   text,
  p_referring_contact_phone text,
  p_receiving_facility      text,
  p_receiving_contact       text,
  p_transport_mode          text,
  p_departure_at            timestamptz,

  p_indication       text,
  p_clinical_summary text,

  p_transfer_bp_systolic_mmhg   integer,
  p_transfer_bp_diastolic_mmhg  integer,
  p_transfer_pulse_bpm          integer,
  p_transfer_respiratory_rate_bpm integer,
  p_transfer_spo2_percent       integer,
  p_transfer_temperature_c      numeric,
  p_transfer_urine_albumin      dipstick_grade,
  p_transfer_fetal_heart_rate_bpm integer,
  p_transfer_vitals_recorded_at timestamptz,

  p_pv_dilatation_cm      numeric,
  p_pv_effacement_percent integer,
  p_pv_station            text,
  p_pv_membranes          membrane_status,
  p_pv_liquor             text,
  p_pv_examined_at        timestamptz,
  p_pv_examined_by        uuid,

  p_lines_and_catheters text,
  p_accompanying_staff  text
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_referral    record;
  v_has_vitals  boolean;
  v_has_pv      boolean;
  v_new_version integer;
begin
  select * into v_referral
  from referrals
  where clinic_id = p_clinic_id and id = p_referral_id
  for update;

  if not found then
    raise exception 'Referral % not found in clinic %', p_referral_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  if v_referral.status <> 'DRAFT' then
    raise exception
      'Referral % is %; an issued referral is corrected by issuing a replacement, never by editing the document travelling with the patient.',
      p_referral_id, v_referral.status
      using errcode = 'restrict_violation';
  end if;

  if v_referral.version <> p_expected_version then
    raise exception
      'Referral % changed while it was being edited (expected version %, found %).',
      p_referral_id, p_expected_version, v_referral.version
      using errcode = 'serialization_failure';
  end if;

  -- A measurement with no time is not a measurement on a handover slip. "BP
  -- 160/110" tells a receiving unit nothing about whether that was on arrival
  -- or four hours ago, and the same logic that makes `administered_at`
  -- mandatory applies here.
  v_has_vitals :=
    p_transfer_bp_systolic_mmhg is not null
    or p_transfer_pulse_bpm is not null
    or p_transfer_respiratory_rate_bpm is not null
    or p_transfer_spo2_percent is not null
    or p_transfer_temperature_c is not null
    or p_transfer_urine_albumin is not null
    or p_transfer_fetal_heart_rate_bpm is not null;

  if v_has_vitals and p_transfer_vitals_recorded_at is null then
    raise exception 'Transfer vitals need the time they were taken.'
      using errcode = 'restrict_violation';
  end if;

  -- Same rule for the vaginal examination. `NOT_ASSESSED` membranes are the
  -- resting state and do not count as a finding; anything else does.
  v_has_pv :=
    p_pv_dilatation_cm is not null
    or p_pv_effacement_percent is not null
    or nullif(btrim(coalesce(p_pv_station, '')), '') is not null
    or coalesce(p_pv_membranes, 'NOT_ASSESSED') <> 'NOT_ASSESSED'
    or nullif(btrim(coalesce(p_pv_liquor, '')), '') is not null;

  if v_has_pv and p_pv_examined_at is null then
    raise exception 'A vaginal examination needs the time it was performed.'
      using errcode = 'restrict_violation';
  end if;

  update referrals
     set referring_facility      = nullif(btrim(coalesce(p_referring_facility, '')), ''),
         referring_doctor_name   = nullif(btrim(coalesce(p_referring_doctor_name, '')), ''),
         referring_contact_phone = nullif(btrim(coalesce(p_referring_contact_phone, '')), ''),
         receiving_facility      = nullif(btrim(coalesce(p_receiving_facility, '')), ''),
         receiving_contact       = nullif(btrim(coalesce(p_receiving_contact, '')), ''),
         transport_mode          = nullif(btrim(coalesce(p_transport_mode, '')), ''),
         departure_at            = p_departure_at,

         indication       = nullif(btrim(coalesce(p_indication, '')), ''),
         clinical_summary = nullif(btrim(coalesce(p_clinical_summary, '')), ''),

         transfer_bp_systolic_mmhg     = p_transfer_bp_systolic_mmhg,
         transfer_bp_diastolic_mmhg    = p_transfer_bp_diastolic_mmhg,
         transfer_pulse_bpm            = p_transfer_pulse_bpm,
         transfer_respiratory_rate_bpm = p_transfer_respiratory_rate_bpm,
         transfer_spo2_percent         = p_transfer_spo2_percent,
         transfer_temperature_c        = p_transfer_temperature_c,
         transfer_urine_albumin        = p_transfer_urine_albumin,
         transfer_fetal_heart_rate_bpm = p_transfer_fetal_heart_rate_bpm,
         -- Cleared when nothing was measured, so a stale time cannot outlive
         -- the reading it belonged to.
         transfer_vitals_recorded_at   = case when v_has_vitals then p_transfer_vitals_recorded_at end,

         pv_dilatation_cm      = p_pv_dilatation_cm,
         pv_effacement_percent = p_pv_effacement_percent,
         pv_station            = nullif(btrim(coalesce(p_pv_station, '')), ''),
         pv_membranes          = coalesce(p_pv_membranes, 'NOT_ASSESSED'),
         pv_liquor             = nullif(btrim(coalesce(p_pv_liquor, '')), ''),
         pv_examined_at        = case when v_has_pv then p_pv_examined_at end,
         pv_examined_by        = case when v_has_pv then p_pv_examined_by end,

         lines_and_catheters = nullif(btrim(coalesce(p_lines_and_catheters, '')), ''),
         accompanying_staff  = nullif(btrim(coalesce(p_accompanying_staff, '')), '')
   where clinic_id = p_clinic_id and id = p_referral_id
  returning version into v_new_version;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'referral.draft_updated', 'referrals', p_referral_id,
    -- Counts and flags, not contents: the draft's clinical text lands in the
    -- snapshot at issue, and copying it into every keystroke's audit row would
    -- scatter the same narrative across the log.
    jsonb_build_object(
      'version', v_new_version,
      'has_transfer_vitals', v_has_vitals,
      'has_pv_findings', v_has_pv,
      'has_indication', nullif(btrim(coalesce(p_indication, '')), '') is not null
    )
  );

  return v_new_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_referral
-- ---------------------------------------------------------------------------
-- Freezes the document. Everything the receiving unit will see is read here,
-- inside the issuing transaction, and written into `issued_snapshot`.
--
-- The snapshot is self-contained by design: it resolves staff names, the
-- clinic's own details and the gestational age to literal values rather than
-- ids. The page that renders it must never need to join back to a live table,
-- because every such join is a way for the document to change after it was
-- handed over.
--
-- Gestational age is frozen from `p_as_of_date`, the clinic's calendar day
-- supplied by the caller. The server's UTC clock is the wrong one for several
-- hours each night in IST, and a slip is most often written in exactly those
-- hours (0004).

create or replace function public.issue_referral(
  p_clinic_id               uuid,
  p_actor_staff_user_id     uuid,
  p_request_id              text,
  p_referral_id             uuid,
  p_expected_version        integer,
  p_as_of_date              date,
  p_snapshot_schema_version integer
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_referral  record;
  v_patient   record;
  v_pregnancy record;
  v_clinic    record;
  v_issuer    record;
  v_examiner  text;
  v_ga_days   integer;
  v_edd       date;
  v_age_years integer;
  v_age_basis text;
  v_history_count integer;
  v_scar_count    integer;
  v_dose_count    integer;
  v_snapshot  jsonb;
begin
  select * into v_referral
  from referrals
  where clinic_id = p_clinic_id and id = p_referral_id
  for update;

  if not found then
    raise exception 'Referral % not found in clinic %', p_referral_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  -- Already issued: hand back the frozen document rather than failing.
  --
  -- This is safe precisely because the document is immutable — there is exactly
  -- one possible answer for an issued referral, so a double-tapped Issue on a
  -- phone in a corridor returns it instead of showing an error at the worst
  -- possible moment. An edit racing an issue is caught by the version check on
  -- the DRAFT path below, not here.
  if v_referral.status = 'ISSUED' then
    return jsonb_build_object(
      'referral_id', p_referral_id,
      'replayed', true,
      'issued_at', v_referral.issued_at,
      'snapshot_schema_version', v_referral.snapshot_schema_version,
      'issued_snapshot', v_referral.issued_snapshot
    );
  end if;

  if v_referral.status <> 'DRAFT' then
    raise exception 'Referral % is %; only a draft can be issued.', p_referral_id, v_referral.status
      using errcode = 'restrict_violation';
  end if;

  if v_referral.version <> p_expected_version then
    raise exception
      'Referral % changed while it was being prepared (expected version %, found %).',
      p_referral_id, p_expected_version, v_referral.version
      using errcode = 'serialization_failure';
  end if;

  -- A handover document with no stated reason for transfer is not a handover
  -- document. The column is nullable so a draft can exist before the reason is
  -- typed; issuing is where it stops being optional.
  if v_referral.indication is null then
    raise exception 'A referral cannot be issued without an indication.'
      using errcode = 'restrict_violation';
  end if;

  if v_referral.receiving_facility is null then
    raise exception 'A referral cannot be issued without a receiving facility.'
      using errcode = 'restrict_violation';
  end if;

  select * into v_clinic from clinics where id = p_clinic_id;

  select * into v_patient
  from patients
  where clinic_id = p_clinic_id and id = v_referral.patient_id;

  select * into v_pregnancy
  from pregnancies
  where clinic_id = p_clinic_id and id = v_referral.pregnancy_id;

  select display_name, registration_no into v_issuer
  from staff_users where id = p_actor_staff_user_id;

  select display_name into v_examiner
  from staff_users where id = v_referral.pv_examined_by;

  -- Gestational age and EDD, resolved to numbers now. A later redating must not
  -- rewrite the gestation a receiving unit was told (0005).
  if v_pregnancy.dating_reference_date is not null then
    v_ga_days := v_pregnancy.dating_reference_ga_days
               + (p_as_of_date - v_pregnancy.dating_reference_date);
    v_edd := v_pregnancy.dating_reference_date
           + (280 - v_pregnancy.dating_reference_ga_days);
  end if;

  -- Age as it is actually known. An age stated two years ago is NOT aged
  -- forward: that would manufacture precision the record does not have, and the
  -- basis travels with the number so the reader can judge it.
  if v_patient.date_of_birth is not null then
    v_age_years := extract(year from age(p_as_of_date::timestamp, v_patient.date_of_birth::timestamp))::integer;
    v_age_basis := 'DATE_OF_BIRTH';
  elsif v_patient.estimated_age_years is not null then
    v_age_years := v_patient.estimated_age_years;
    v_age_basis := 'STATED';
  else
    v_age_basis := 'UNKNOWN';
  end if;

  select count(*), count(*) filter (where has_uterine_scar)
    into v_history_count, v_scar_count
  from obstetric_history
  where clinic_id = p_clinic_id and patient_id = v_referral.patient_id;

  v_snapshot := jsonb_build_object(
    'schemaVersion', p_snapshot_schema_version,
    'issuedAt', now(),
    'asOfDate', p_as_of_date,
    -- Frozen with the document. The public page has no session and therefore no
    -- actor to carry a clinic timezone, and every time on the slip — the dose
    -- at 01:40, the BP at 02:14 — has to read as the ward clock the sender and
    -- the receiver are both looking at. Rendering those in the reader's browser
    -- zone would silently shift them.
    'timeZone', v_clinic.timezone,

    'issuedBy', jsonb_build_object(
      'name', v_issuer.display_name,
      -- Printed on the slip. A receiving unit ringing back needs a named
      -- clinician, not a user id.
      'registrationNo', v_issuer.registration_no
    ),

    'referringFacility', jsonb_build_object(
      -- The typed value wins; the clinic's own name is the fallback so a slip
      -- never goes out with no origin on it.
      'name', coalesce(v_referral.referring_facility, v_clinic.name),
      'address', v_clinic.address,
      'phone', coalesce(v_referral.referring_contact_phone, v_clinic.contact_phone),
      'doctorName', v_referral.referring_doctor_name
    ),

    'receivingFacility', jsonb_build_object(
      'name', v_referral.receiving_facility,
      'contact', v_referral.receiving_contact
    ),

    'transfer', jsonb_build_object(
      'mode', v_referral.transport_mode,
      'departureAt', v_referral.departure_at,
      'accompanyingStaff', v_referral.accompanying_staff,
      'linesAndCatheters', v_referral.lines_and_catheters
    ),

    'patient', jsonb_build_object(
      'uhid', v_patient.uhid,
      'fullName', v_patient.full_name,
      'age', case
               when v_age_basis = 'UNKNOWN' then jsonb_build_object('status', 'UNKNOWN')
               else jsonb_build_object('status', 'KNOWN', 'years', v_age_years, 'basis', v_age_basis)
             end,
      -- Tagged rather than nullable. Rh status is the first thing read on a
      -- slip, and an empty line there is read as "nothing remarkable".
      'bloodGroup', case
                      when v_patient.blood_group is null then jsonb_build_object('status', 'NOT_RECORDED')
                      else jsonb_build_object(
                        'status', 'KNOWN',
                        'value', v_patient.blood_group,
                        'source', v_patient.blood_group_source,
                        'recordedOn', v_patient.blood_group_recorded_on
                      )
                    end,
      -- Three states, never two. "Not asked" must never print as "no known
      -- allergies" on the document a receiving unit prescribes from.
      'allergies', jsonb_build_object(
        'status', v_patient.allergy_status,
        'items', coalesce(
          (select jsonb_agg(jsonb_build_object(
                    'substance', a.substance,
                    'reaction', a.reaction,
                    'severity', a.severity
                  ) order by a.recorded_at)
             from patient_allergies a
            where a.clinic_id = p_clinic_id
              and a.patient_id = v_referral.patient_id
              -- A retracted allergy is history, not a live contraindication.
              and a.retracted_at is null),
          '[]'::jsonb)
      )
    ),

    'pregnancy', jsonb_build_object(
      'dating', case
                  when v_ga_days is null then jsonb_build_object('status', 'NOT_ESTABLISHED')
                  else jsonb_build_object(
                    'status', 'ESTABLISHED',
                    'gaDays', v_ga_days,
                    'estimatedDueDate', v_edd,
                    'method', v_pregnancy.dating_method,
                    'certainty', v_pregnancy.dating_certainty
                  )
                end,
      'gravida', v_pregnancy.gravida,
      'parity', v_pregnancy.parity,
      'living', v_pregnancy.living,
      'abortions', v_pregnancy.abortions,
      -- Three states again. "No scar recorded" and "no obstetric history on
      -- file at all" support completely different decisions about a trial of
      -- labour, and collapsing them into an empty field hides that.
      'uterineScar', case
                       when v_history_count = 0 then jsonb_build_object('status', 'NO_HISTORY_RECORDED')
                       when v_scar_count = 0 then jsonb_build_object('status', 'NONE_IN_RECORDED_HISTORY')
                       else jsonb_build_object('status', 'PRESENT', 'count', v_scar_count)
                     end,
      'priorPregnanciesOnRecord', v_history_count
    ),

    'transferVitals', case
      when v_referral.transfer_vitals_recorded_at is null then
        jsonb_build_object('status', 'NOT_RECORDED')
      else jsonb_build_object(
        'status', 'RECORDED',
        'recordedAt', v_referral.transfer_vitals_recorded_at,
        -- Paired or absent. A lone diastolic is not a low reading, it is not a
        -- blood pressure at all (0005 makes the same pairing a CHECK).
        'bloodPressure', case
                           when v_referral.transfer_bp_systolic_mmhg is null then null
                           else jsonb_build_object(
                             'systolicMmHg', v_referral.transfer_bp_systolic_mmhg,
                             'diastolicMmHg', v_referral.transfer_bp_diastolic_mmhg
                           )
                         end,
        'pulseBpm', v_referral.transfer_pulse_bpm,
        'respiratoryRateBpm', v_referral.transfer_respiratory_rate_bpm,
        'spo2Percent', v_referral.transfer_spo2_percent,
        'temperatureC', v_referral.transfer_temperature_c,
        'urineAlbumin', v_referral.transfer_urine_albumin,
        'fetalHeartRateBpm', v_referral.transfer_fetal_heart_rate_bpm
      )
    end,

    'examination', case
      when v_referral.pv_examined_at is null then jsonb_build_object('status', 'NOT_PERFORMED')
      else jsonb_build_object(
        'status', 'PERFORMED',
        'examinedAt', v_referral.pv_examined_at,
        'examinedBy', v_examiner,
        'dilatationCm', v_referral.pv_dilatation_cm,
        'effacementPercent', v_referral.pv_effacement_percent,
        'station', v_referral.pv_station,
        'membranes', v_referral.pv_membranes,
        'liquor', v_referral.pv_liquor
      )
    end,

    -- THE REASON THIS FEATURE EXISTS.
    --
    -- Read from `medication_administrations`, never from `prescriptions`. An
    -- order records a decision; an administration records an event, with a
    -- mandatory time. Redosing magnesium sulphate on a mother who had a loading
    -- dose ninety minutes ago is the harm this list prevents, and a
    -- prescription row cannot tell anyone whether the drug reached her.
    'preReferralDoses', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'medicineName', m.medicine_name,
                'amount', m.dose_amount,
                'unit', m.dose_unit,
                'route', m.route,
                'administeredAt', m.administered_at,
                'facility', m.administered_at_facility,
                -- Witnessed, documented, patient-reported and uncertain are
                -- very different claims and travel with the dose.
                'certainty', m.certainty,
                'note', m.note
              ) order by m.administered_at desc)
         from medication_administrations m
        where m.clinic_id = p_clinic_id
          and m.pregnancy_id = v_referral.pregnancy_id),
      '[]'::jsonb),

    -- Verified results only, superseded ones excluded. A corrected haemoglobin
    -- must not travel next to the value it corrected.
    'recentResults', coalesce(
      (select jsonb_agg(r) from (
         select jsonb_build_object(
                  'testName', o.test_name,
                  'category', o.category,
                  'valueNumeric', o.value_numeric,
                  'valueText', o.value_text,
                  'unit', o.unit_original,
                  'observedDate', o.observed_date,
                  'observedDatePrecision', o.observed_date_precision,
                  'source', o.source,
                  'clinicianNote', o.clinician_note
                ) as r
           from observations o
          where o.clinic_id = p_clinic_id
            and o.pregnancy_id = v_referral.pregnancy_id
            and o.superseded_at is null
          order by o.observed_date desc, o.verified_at desc
          -- Bounded so the slip stays one sheet. The cap is on the document,
          -- not on the record: the full history stays in the cockpit.
          limit 12
       ) as recent),
      '[]'::jsonb),

    'indication', v_referral.indication,
    'clinicalSummary', v_referral.clinical_summary,

    'supersedesReferralId', v_referral.supersedes_id
  );

  select jsonb_array_length(v_snapshot->'preReferralDoses') into v_dose_count;

  update referrals
     set status                  = 'ISSUED',
         issued_snapshot         = v_snapshot,
         snapshot_schema_version = p_snapshot_schema_version,
         issued_by               = p_actor_staff_user_id,
         issued_at               = now()
   where clinic_id = p_clinic_id and id = p_referral_id;

  -- The replaced document is retired only now, at the moment a replacement
  -- exists. Until this statement runs, the original is still the live slip.
  if v_referral.supersedes_id is not null then
    update referrals
       set status        = 'SUPERSEDED',
           superseded_at = now()
     where clinic_id = p_clinic_id
       and id = v_referral.supersedes_id
       and status = 'ISSUED';

    if found then
      -- Every token on the old document stops working in the same transaction.
      -- A superseded slip that still opens is two contradictory documents in
      -- circulation, which is the failure supersession exists to avoid.
      update referral_access_tokens
         set revoked_at = now(),
             revoked_by = p_actor_staff_user_id
       where clinic_id = p_clinic_id
         and referral_id = v_referral.supersedes_id
         and revoked_at is null;

      insert into audit_events (
        clinic_id, actor_staff_user_id, request_id,
        action, entity_table, entity_id, payload
      ) values (
        p_clinic_id, p_actor_staff_user_id, p_request_id,
        'referral.superseded', 'referrals', v_referral.supersedes_id,
        jsonb_build_object('superseded_by', p_referral_id)
      );
    end if;
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'referral.issued', 'referrals', p_referral_id,
    -- The snapshot itself is not copied here: it already lives, immutably, on
    -- the referral row, and a second copy is a second thing to keep in step.
    jsonb_build_object(
      'patient_id', v_referral.patient_id,
      'pregnancy_id', v_referral.pregnancy_id,
      'snapshot_schema_version', p_snapshot_schema_version,
      'ga_days_at_issue', v_ga_days,
      'pre_referral_doses', v_dose_count,
      'supersedes_id', v_referral.supersedes_id
    )
  );

  return jsonb_build_object(
    'referral_id', p_referral_id,
    'replayed', false,
    'issued_at', now(),
    'snapshot_schema_version', p_snapshot_schema_version,
    'issued_snapshot', v_snapshot
  );
end;
$$;

comment on function public.issue_referral is
  'Freezes the handover document into referrals.issued_snapshot and audits the issue. Mints no access token: the raw token exists exactly once and is minted by a separate, explicit act.';

-- ---------------------------------------------------------------------------
-- create_referral_token
-- ---------------------------------------------------------------------------
-- The token is minted and hashed in the application; this function receives hex
-- and never sees the raw value. A database dump therefore contains no working
-- link, which is the same reason a password is not stored.
--
-- Several live tokens per referral are allowed on purpose: the ambulance crew,
-- the receiving labour ward and the family may each be handed one, and
-- revoking the family's must not lock out the ward.

create or replace function public.create_referral_token(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_referral_id         uuid,
  p_token_hash          text,
  p_ttl_minutes         integer
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_status     referral_status;
  v_token_id   uuid;
  v_expires_at timestamptz;
begin
  select status into v_status
  from referrals
  where clinic_id = p_clinic_id and id = p_referral_id
  for update;

  if not found then
    raise exception 'Referral % not found in clinic %', p_referral_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  -- A link to a draft would be a link to a document that is still changing,
  -- and a link to a superseded or cancelled one would keep a retired slip in
  -- circulation.
  if v_status <> 'ISSUED' then
    raise exception 'Referral % is %; only an issued referral can be shared.', p_referral_id, v_status
      using errcode = 'restrict_violation';
  end if;

  -- Bounded here as well as in the schema. The lower bound stops a link
  -- expiring before the ambulance arrives; the upper bound stops a handover
  -- link quietly becoming a permanent record-sharing URL.
  if p_ttl_minutes is null or p_ttl_minutes < 15 or p_ttl_minutes > 10080 then
    raise exception 'A referral link must live between 15 minutes and 7 days.'
      using errcode = 'restrict_violation';
  end if;

  v_expires_at := now() + make_interval(mins => p_ttl_minutes);

  insert into referral_access_tokens (
    clinic_id, referral_id, token_hash, expires_at, issued_by
  ) values (
    p_clinic_id, p_referral_id, decode(p_token_hash, 'hex'), v_expires_at, p_actor_staff_user_id
  )
  returning id into v_token_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'referral.token_created', 'referral_access_tokens', v_token_id,
    -- The hash is deliberately absent. An audit trail that records the lookup
    -- key is a second copy of the lookup key.
    jsonb_build_object('referral_id', p_referral_id, 'expires_at', v_expires_at)
  );

  return jsonb_build_object('token_id', v_token_id, 'expires_at', v_expires_at);
end;
$$;

comment on function public.create_referral_token is
  'Stores the SHA-256 hash of a freshly minted referral link token. The raw token is never passed in and never stored.';

-- ---------------------------------------------------------------------------
-- revoke_referral_token
-- ---------------------------------------------------------------------------
-- Revocation is the one permitted change to a token row (0010 guards the rest).
-- Revoking an already-revoked or expired token is a no-op rather than an error:
-- the caller asked for the link to stop working, and it has.

create or replace function public.revoke_referral_token(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_token_id            uuid,
  p_reason              text
)
returns boolean
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_referral_id uuid;
begin
  update referral_access_tokens
     set revoked_at = now(),
         revoked_by = p_actor_staff_user_id
   where clinic_id = p_clinic_id
     and id = p_token_id
     and revoked_at is null
  returning referral_id into v_referral_id;

  if not found then
    -- Either no such token in this clinic, or it was already revoked. Both are
    -- a no-op for the caller, and neither distinguishes one from the other.
    return false;
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'referral.token_revoked', 'referral_access_tokens', p_token_id,
    jsonb_build_object(
      'referral_id', v_referral_id,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- log_referral_access
-- ---------------------------------------------------------------------------
-- The public page's only entry point. It resolves the token, records the
-- attempt and returns the frozen document in one transaction, so an access
-- cannot be served without being recorded — "who opened this woman's handover
-- document, and when" has to already be answerable when it is asked.
--
-- EXPIRED, REVOKED AND UNKNOWN ARE INDISTINGUISHABLE TO THE CALLER
-- ----------------------------------------------------------------
-- The true outcome is written to `referral_access_log`; what comes back is
-- `{"granted": false}` and nothing else. Making the distinction unrepresentable
-- above the database is stronger than trusting every future caller to collapse
-- it: a page that says "this link has expired" confirms that the link was real,
-- and confirms it to whoever is holding a guessed one.
--
-- An unknown token is recorded nowhere, and cannot be: `referral_access_log`
-- requires a token, and `audit_events` requires a clinic. There is no tenant to
-- attribute the attempt to. That is also a useful property — enumeration cannot
-- be used to fill another clinic's audit log.

create or replace function public.log_referral_access(
  p_token_hash     text,
  -- Hashed by the caller. Enough to recognise repeat access without keeping a
  -- network identifier alongside health data.
  p_client_ip_hash text,
  p_user_agent     text
)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_token    record;
  v_referral record;
  v_outcome  text;
begin
  select * into v_token
  from referral_access_tokens
  where token_hash = decode(p_token_hash, 'hex');

  if not found then
    return jsonb_build_object('granted', false);
  end if;

  select * into v_referral
  from referrals
  where clinic_id = v_token.clinic_id and id = v_token.referral_id;

  if v_token.revoked_at is not null then
    v_outcome := 'REVOKED';
  elsif v_token.expires_at <= now() then
    v_outcome := 'EXPIRED';
  elsif v_referral.status <> 'ISSUED' or v_referral.issued_snapshot is null then
    -- A superseded or cancelled document. Its tokens are revoked when it is
    -- retired, so this is belt and braces — but a retired slip must never open
    -- even if a revocation was missed.
    v_outcome := 'REVOKED';
  else
    v_outcome := 'GRANTED';
  end if;

  insert into referral_access_log (
    token_id, referral_id, client_ip_hash, user_agent, outcome
  ) values (
    v_token.id,
    v_token.referral_id,
    case when p_client_ip_hash is null then null else decode(p_client_ip_hash, 'hex') end,
    nullif(btrim(coalesce(p_user_agent, '')), ''),
    v_outcome
  );

  insert into audit_events (
    clinic_id, actor_worker, actor_description, request_id,
    action, entity_table, entity_id, payload
  ) values (
    v_token.clinic_id,
    -- `audit_events` requires exactly one actor, and a receiving doctor holding
    -- a link is neither a staff user nor a background job. The token-bearer is
    -- recorded as the closest representable thing, with the description saying
    -- plainly what it was.
    'referral-public-page',
    'Unauthenticated read of a tokenized referral page',
    null,
    'referral.accessed', 'referrals', v_token.referral_id,
    jsonb_build_object('outcome', v_outcome, 'token_id', v_token.id)
  );

  if v_outcome <> 'GRANTED' then
    return jsonb_build_object('granted', false);
  end if;

  return jsonb_build_object(
    'granted', true,
    'referral_id', v_referral.id,
    'issued_at', v_referral.issued_at,
    'snapshot_schema_version', v_referral.snapshot_schema_version,
    -- The frozen document, and only the frozen document. Nothing here is read
    -- from a live clinical table, so the page cannot drift from the printed
    -- slip that was generated with it.
    'issued_snapshot', v_referral.issued_snapshot
  );
end;
$$;

comment on function public.log_referral_access is
  'Resolves a referral link token, records the attempt and returns the frozen snapshot in one transaction. Expired, revoked and unknown tokens are indistinguishable in the return value.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- These write clinical and audit rows, so only the service role may call them.
-- `log_referral_access` is revoked from anon as firmly as the rest: the public
-- page is served by server-side code holding the service role, and no anonymous
-- caller ever gets a database handle (0012).

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_referral_draft(uuid, uuid, text, uuid, uuid, uuid, text, text)',
    'public.update_referral_draft(uuid, uuid, text, uuid, integer, text, text, text, text, text, text, timestamptz, text, text, integer, integer, integer, integer, integer, numeric, dipstick_grade, integer, timestamptz, numeric, integer, text, membrane_status, text, timestamptz, uuid, text, text)',
    'public.issue_referral(uuid, uuid, text, uuid, integer, date, integer)',
    'public.create_referral_token(uuid, uuid, text, uuid, text, integer)',
    'public.revoke_referral_token(uuid, uuid, text, uuid, text)',
    'public.log_referral_access(text, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
