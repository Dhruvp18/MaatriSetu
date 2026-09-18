-- ---------------------------------------------------------------------------
-- 0003 — Patients, contacts, allergies and the file QR token
-- ---------------------------------------------------------------------------
-- Departures from PRD §8, each deliberate:
--
--   * LMP / EDD / GPLA are NOT on this table. They belong to a pregnancy
--     episode (0004). Storing them here destroys the previous pregnancy's
--     record the moment a mother returns, and retroactively corrupts the
--     gestational age of every past visit and scan.
--   * `allergies text[]` is replaced by an explicit status plus rows. An empty
--     array is indistinguishable from "never asked", and on a referral slip at
--     2 AM that difference is the whole point.
--   * Phone is not an identity key and is not unique. Shared family handsets
--     are the norm in this population; see patient_contacts.
--   * The QR token is stored hashed and is revocable, so a lost sticker can be
--     retired without changing the patient's identity.
-- ---------------------------------------------------------------------------

create type abha_verification as enum ('NOT_PROVIDED', 'SELF_DECLARED', 'VERIFIED');

create type contact_relationship as enum (
  'SELF', 'HUSBAND', 'MOTHER', 'MOTHER_IN_LAW', 'FATHER', 'OTHER_RELATIVE', 'NEIGHBOUR', 'OTHER'
);

create type allergy_severity as enum ('UNKNOWN', 'MILD', 'MODERATE', 'SEVERE');

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------

create table patients (
  id         uuid not null default gen_random_uuid(),
  clinic_id  uuid not null references clinics (id) on delete restrict,

  -- Hospital identifier as written on the paper file. Unique within a clinic,
  -- never across clinics — two hospitals legitimately reuse the same series.
  uhid       citext not null check (length(btrim(uhid::text)) > 0),

  full_name  text not null check (length(btrim(full_name)) > 0),

  -- Age is usually stated, not documented. Recording the date it was stated is
  -- what makes it still interpretable at a later visit.
  date_of_birth      date,
  estimated_age_years integer check (estimated_age_years between 9 and 70),
  age_recorded_on    date,
  constraint patients_age_known
    check (date_of_birth is not null or estimated_age_years is not null),
  constraint patients_estimated_age_dated
    check (estimated_age_years is null or age_recorded_on is not null),

  abha_id            text,
  abha_verification  abha_verification not null default 'NOT_PROVIDED',
  constraint patients_abha_consistent
    check ((abha_id is null) = (abha_verification = 'NOT_PROVIDED')),

  -- Tri-state, never inferred from the absence of allergy rows.
  allergy_status     known_status not null default 'UNKNOWN',

  blood_group        blood_group,
  blood_group_source data_source,
  blood_group_recorded_on date,
  constraint patients_blood_group_has_provenance
    check ((blood_group is null) = (blood_group_source is null)),

  -- Opaque sticker token. Raw value is shown once at print time and never
  -- stored; lookups hash the scanned value and compare.
  qr_token_hash      bytea unique,
  qr_token_issued_at timestamptz,
  qr_token_revoked_at timestamptz,

  created_by uuid references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint patients_pkey primary key (id),
  constraint patients_uhid_unique_per_clinic unique (clinic_id, uhid),
  -- Enables composite foreign keys from child tables, which makes a
  -- cross-clinic reference impossible rather than merely unlikely.
  constraint patients_tenant_key unique (clinic_id, id)
);

create index patients_clinic_name_idx on patients (clinic_id, full_name);
create index patients_qr_active_idx on patients (qr_token_hash)
  where qr_token_hash is not null and qr_token_revoked_at is null;

create trigger touch_patients
  before update on patients
  for each row execute function app.touch_row();

comment on column patients.allergy_status is
  'UNKNOWN until a clinician has actually asked. Never derive this from the presence or absence of patient_allergies rows.';

-- ---------------------------------------------------------------------------
-- patient_allergies
-- ---------------------------------------------------------------------------

create table patient_allergies (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  substance  text not null check (length(btrim(substance)) > 0),
  reaction   text,
  severity   allergy_severity not null default 'UNKNOWN',
  source     data_source not null,

  recorded_by uuid references staff_users (id),
  recorded_at timestamptz not null default now(),
  -- Retracted rather than deleted: an allergy once recorded and later
  -- disproved is itself clinically relevant.
  retracted_at timestamptz,
  retracted_by uuid references staff_users (id),
  retraction_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint patient_allergies_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict
);

create index patient_allergies_patient_idx
  on patient_allergies (patient_id) where retracted_at is null;

create trigger touch_patient_allergies
  before update on patient_allergies
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- patient_contacts
-- ---------------------------------------------------------------------------
-- A phone number identifies a *handset*, not a person. One number may reach
-- several patients (co-wives, sisters-in-law, a shared village phone), and one
-- patient may be reachable on several numbers.
--
-- Inbound voice notes are matched against verified associations only. An
-- unverified match goes to a review queue; it never silently attaches clinical
-- content to a patient record.

create table patient_contacts (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null,
  patient_id uuid not null,

  -- Stored E.164 (+91XXXXXXXXXX). Normalization happens in the application so
  -- the rule is testable; the constraint here is the backstop.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  relationship contact_relationship not null default 'SELF',
  contact_name text,

  is_primary boolean not null default false,

  -- Messaging consent is per contact, not per patient: the mother may consent
  -- for her own handset and not for her mother-in-law's.
  messaging_consent_at timestamptz,
  messaging_consent_withdrawn_at timestamptz,

  -- Association verification gates inbound matching.
  verified_at timestamptz,
  verified_by uuid references staff_users (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint patient_contacts_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint patient_contacts_unique_number_per_patient unique (patient_id, phone_e164),
  constraint patient_contacts_verification_complete
    check ((verified_at is null) = (verified_by is null))
);

-- Deliberately NOT unique: the same number may legitimately appear for several
-- patients. This index supports the inbound-matching lookup and the review
-- queue that handles the ambiguous case.
create index patient_contacts_phone_idx on patient_contacts (clinic_id, phone_e164);

-- At most one primary contact per patient.
create unique index patient_contacts_one_primary_idx
  on patient_contacts (patient_id) where is_primary;

create trigger touch_patient_contacts
  before update on patient_contacts
  for each row execute function app.touch_row();

comment on table patient_contacts is
  'Phone-to-patient is many-to-many. Never merge patients on a shared number; never auto-attach an inbound message to an unverified association.';
