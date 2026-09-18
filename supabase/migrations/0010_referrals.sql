-- ---------------------------------------------------------------------------
-- 0010 — Emergency referrals: drafts, issued snapshots, access tokens
-- ---------------------------------------------------------------------------
-- A referral is a legal handover document. Once issued it is frozen:
--
--   * The issued snapshot is written once and protected by a trigger. The
--     printed page and the mobile page render from the SAME snapshot, so they
--     cannot disagree — a printed slip that contradicts the QR page it was
--     generated with is worse than having neither.
--   * A clinical correction issues a NEW referral that supersedes the old one.
--     It never edits the document already travelling with the patient.
--   * Later edits to the patient's record do not retroactively change what a
--     receiving unit was handed.
--
-- Access tokens are stored hashed and are separate rows, so a link can be
-- re-issued or revoked without touching the clinical snapshot.
--
-- Referral creation is deliberately independent of the consultation save: a
-- patient crashing at 2 AM is not inside an OPD visit, and the handover must
-- not be blocked on finishing a consultation.
-- ---------------------------------------------------------------------------

create type referral_status as enum ('DRAFT', 'ISSUED', 'SUPERSEDED', 'CANCELLED');

create type membrane_status as enum ('INTACT', 'RUPTURED', 'NOT_ASSESSED');

create table referrals (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,
  -- Optional: a referral may arise outside any consultation.
  origin_visit_id uuid,

  status referral_status not null default 'DRAFT',

  -- Group 1 — identifiers and facilities
  referring_facility text,
  referring_doctor_name text,
  referring_contact_phone text,
  receiving_facility text,
  receiving_contact text,
  transport_mode text,
  departure_at timestamptz,

  -- Group 6 — indication and summary
  indication text,
  clinical_summary text,

  -- Group 3 — transfer vitals, as typed columns so they can be validated and
  -- rendered consistently rather than as an unvalidated blob.
  transfer_bp_systolic_mmhg  integer check (transfer_bp_systolic_mmhg  between 50 and 300),
  transfer_bp_diastolic_mmhg integer check (transfer_bp_diastolic_mmhg between 20 and 200),
  transfer_pulse_bpm         integer check (transfer_pulse_bpm between 20 and 250),
  transfer_respiratory_rate_bpm integer check (transfer_respiratory_rate_bpm between 4 and 80),
  transfer_spo2_percent      integer check (transfer_spo2_percent between 50 and 100),
  transfer_temperature_c     numeric(4,1) check (transfer_temperature_c between 30 and 45),
  transfer_urine_albumin     dipstick_grade,
  transfer_fetal_heart_rate_bpm integer check (transfer_fetal_heart_rate_bpm between 60 and 240),
  transfer_vitals_recorded_at timestamptz,

  -- Group 5 — examination findings
  pv_dilatation_cm numeric(3,1) check (pv_dilatation_cm between 0 and 10),
  pv_effacement_percent integer check (pv_effacement_percent between 0 and 100),
  pv_station text,
  pv_membranes membrane_status not null default 'NOT_ASSESSED',
  pv_liquor text,
  pv_examined_at timestamptz,
  pv_examined_by uuid references staff_users (id),

  lines_and_catheters text,
  accompanying_staff  text,

  -- The frozen document. Null while DRAFT; written exactly once at issue.
  issued_snapshot jsonb,
  -- Version of the snapshot's shape, so an old referral can still be rendered
  -- correctly after the format evolves.
  snapshot_schema_version integer,

  issued_by uuid references staff_users (id),
  issued_at timestamptz,

  supersedes_id uuid,
  superseded_at timestamptz,
  cancelled_at  timestamptz,
  cancelled_by  uuid references staff_users (id),
  cancellation_reason text,

  created_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint referrals_pkey primary key (id),
  constraint referrals_tenant_key unique (clinic_id, id),
  constraint referrals_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint referrals_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint referrals_visit_fk
    foreign key (clinic_id, origin_visit_id) references visits (clinic_id, id) on delete restrict,
  constraint referrals_supersedes_fk
    foreign key (clinic_id, supersedes_id) references referrals (clinic_id, id) on delete restrict,

  constraint referrals_bp_paired
    check ((transfer_bp_systolic_mmhg is null) = (transfer_bp_diastolic_mmhg is null)),
  -- An issued referral has a frozen snapshot, an issuer and a timestamp.
  constraint referrals_issued_is_complete
    check (
      status = 'DRAFT'
      or status = 'CANCELLED'
      or (issued_snapshot is not null and issued_at is not null and issued_by is not null
          and snapshot_schema_version is not null)
    ),
  constraint referrals_cancel_explained
    check (status <> 'CANCELLED' or cancellation_reason is not null)
);

create index referrals_pregnancy_idx on referrals (pregnancy_id, created_at desc);
create index referrals_clinic_issued_idx
  on referrals (clinic_id, issued_at desc) where status = 'ISSUED';

create trigger touch_referrals
  before update on referrals
  for each row execute function app.touch_row();

-- Freeze the document at issue. After that, only lifecycle columns may move.
create or replace function app.guard_referral_snapshot()
returns trigger
language plpgsql
as $$
begin
  if old.issued_snapshot is not null
     and new.issued_snapshot is distinct from old.issued_snapshot then
    raise exception
      'referrals: an issued snapshot is immutable. Issue a superseding referral instead of editing this one.'
      using errcode = 'restrict_violation';
  end if;

  if old.status = 'ISSUED' and new.status = 'DRAFT' then
    raise exception 'referrals: an issued referral cannot return to draft.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger referrals_snapshot_immutable
  before update on referrals
  for each row execute function app.guard_referral_snapshot();

comment on column referrals.issued_snapshot is
  'The complete handover document, frozen at issue. Print and mobile views render from this and only this, so they can never disagree.';

-- ---------------------------------------------------------------------------
-- referral_access_tokens
-- ---------------------------------------------------------------------------
-- The raw token is returned exactly once, to be encoded in the QR. Only its
-- hash is stored, so database read access does not confer the ability to open
-- every referral page ever issued.

create table referral_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null,
  referral_id uuid not null,

  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references staff_users (id),

  issued_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),

  constraint referral_access_tokens_referral_fk
    foreign key (clinic_id, referral_id) references referrals (clinic_id, id) on delete restrict,
  constraint referral_access_tokens_expiry_future
    check (expires_at > created_at)
);

create index referral_access_tokens_referral_idx
  on referral_access_tokens (referral_id, created_at desc);

create index referral_access_tokens_active_idx
  on referral_access_tokens (token_hash) where revoked_at is null;

-- Tokens are append-only: revocation is the one permitted change, handled by
-- a targeted update guard rather than a blanket immutability trigger.
create or replace function app.guard_referral_token()
returns trigger
language plpgsql
as $$
begin
  if new.token_hash is distinct from old.token_hash
     or new.referral_id is distinct from old.referral_id
     or new.expires_at is distinct from old.expires_at then
    raise exception
      'referral_access_tokens: issue a new token instead of modifying an existing one.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger referral_access_tokens_guard
  before update on referral_access_tokens
  for each row execute function app.guard_referral_token();

-- ---------------------------------------------------------------------------
-- referral_access_log
-- ---------------------------------------------------------------------------
-- Every open of a public referral page. Required to answer "who saw this
-- patient's handover document". The raw token never appears here.

create table referral_access_log (
  id        uuid primary key default gen_random_uuid(),
  token_id  uuid not null references referral_access_tokens (id) on delete restrict,
  referral_id uuid not null,

  accessed_at timestamptz not null default now(),
  -- Hashed, not stored raw: enough to recognise repeat access without
  -- retaining a network identifier alongside health data.
  client_ip_hash bytea,
  user_agent text,
  outcome text not null check (outcome in ('GRANTED', 'EXPIRED', 'REVOKED', 'NOT_FOUND')),

  created_at timestamptz not null default now()
);

create index referral_access_log_referral_idx on referral_access_log (referral_id, accessed_at desc);

create trigger referral_access_log_append_only
  before update or delete on referral_access_log
  for each row execute function app.forbid_mutation();
