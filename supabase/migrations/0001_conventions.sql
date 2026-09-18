-- ---------------------------------------------------------------------------
-- 0001 — Extensions, schema conventions and shared helpers
-- ---------------------------------------------------------------------------
-- Conventions applied throughout this schema:
--
--   * Mutable entities carry: id uuid PK, created_at, updated_at, version int.
--     `version` supports optimistic concurrency; the two-minute consultation
--     means concurrent edits and double-submits are expected, not exotic.
--   * Append-only entities (audit, issued snapshots) carry created_at only.
--   * Clinical instants use timestamptz. Calendar facts (LMP, EDD) use date,
--     because a due date is not an instant and must not shift with timezone.
--   * Every measurement stores its unit alongside its value (ARCH-9).
--   * Tenant-owned tables carry clinic_id and expose UNIQUE (clinic_id, id) so
--     children can use composite foreign keys, making a cross-tenant reference
--     structurally impossible rather than merely discouraged.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive identifiers

-- Helper functions live in their own schema so they are never mistaken for
-- tables and can be granted separately.
create schema if not exists app;

comment on schema app is
  'Internal helper functions and triggers. Not a public API surface.';

-- ---------------------------------------------------------------------------
-- updated_at / version maintenance
-- ---------------------------------------------------------------------------
-- Bumping `version` in the same trigger guarantees the optimistic-concurrency
-- counter cannot be forgotten by an application-level UPDATE.

create or replace function app.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.version is not distinct from old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

comment on function app.touch_row() is
  'BEFORE UPDATE trigger: maintains updated_at and increments the optimistic-concurrency version.';

-- Convenience: attach the standard trigger to a table.
create or replace function app.attach_touch_trigger(target regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger touch_%s before update on %s for each row execute function app.touch_row()',
    replace(target::text, '.', '_'),
    target
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
-- Used by audit_events and issued referral snapshots. A medico-legal record
-- that can be quietly edited is not a record.

create or replace function app.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Table % is append-only; % is not permitted. Correct the record by inserting a superseding row.',
    tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function app.forbid_mutation() is
  'BEFORE UPDATE OR DELETE trigger: rejects mutation of append-only tables.';

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

-- Precision of a recorded clinical date. A slip that reads "Jan 2026" must not
-- be silently stored as 1 January 2026 and then used to compute an interval.
create type date_precision as enum ('DAY', 'MONTH', 'YEAR', 'UNKNOWN');

-- Tri-state used wherever "we have not asked" must be distinguishable from
-- "we asked and the answer is no" (ARCH-10).
create type known_status as enum ('UNKNOWN', 'NONE_KNOWN', 'KNOWN');

create type blood_group as enum (
  'A_POS', 'A_NEG', 'B_POS', 'B_NEG',
  'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'
);

-- How a fact reached the system. Provenance is displayed next to any value a
-- clinician might act on, and is required on the referral snapshot.
create type data_source as enum (
  'CLINICIAN_ENTERED',   -- typed by a clinician during a consultation
  'STAFF_ENTERED',       -- typed by nurse/assistant at registration or intake
  'EXTRACTED_VERIFIED',  -- read from a document, then verified by a clinician
  'PATIENT_REPORTED',    -- stated by the mother; not independently confirmed
  'EXTERNAL_RECORD'      -- imported from another facility's record
);

comment on type data_source is
  'Provenance of a clinical value. EXTRACTED_VERIFIED still requires a clinician verifier; extraction alone never produces a clinical fact.';
