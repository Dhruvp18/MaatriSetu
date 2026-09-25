-- ---------------------------------------------------------------------------
-- 0032 — Patient portal credentials (username/password login)
-- ---------------------------------------------------------------------------
-- Replaces the QR-less demo login's "pick your name from a list" with a real
-- password check. The identifier is her UHID — already printed on her card,
-- already not secret — so, like a bank account number or an employee id,
-- security rests entirely on the password, never on the identifier being
-- hard to guess.
--
-- One row per patient, holding only a salted hash (core/auth/password-hash.ts,
-- scrypt) — never the password itself, the same rule the QR token follows for
-- its own secret (core/tokens/opaque-token.ts).
--
-- Locked down harder than any other patient-portal table: nobody reads this
-- one over PostgREST, not even clinic staff. There is no SELECT policy at
-- all, so RLS denies every row to every browser session; only the service
-- role (used exclusively server-side) can reach it.
-- ---------------------------------------------------------------------------

create table patient_credentials (
  patient_id    uuid primary key,
  clinic_id     uuid not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint patient_credentials_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict
);

comment on table patient_credentials is
  'Password hash for the patient portal login. Service role only — no SELECT policy exists, so RLS denies this table to every browser session including staff.';

alter table patient_credentials enable row level security;
alter table patient_credentials force row level security;

revoke all on patient_credentials from anon;
revoke all on patient_credentials from authenticated;
