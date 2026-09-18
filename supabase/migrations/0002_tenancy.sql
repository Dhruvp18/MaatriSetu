-- ---------------------------------------------------------------------------
-- 0002 — Clinics, staff accounts, memberships and authorization helpers
-- ---------------------------------------------------------------------------
-- Multi-tenancy exists from the first migration. Retrofitting tenant isolation
-- onto a live clinical database is not realistically possible, and the pilot
-- plan already anticipates two sites.
--
-- A role is never stored on the user. It is stored on the *membership*, because
-- the same person can be a doctor at one facility and hold no access at another.
-- ---------------------------------------------------------------------------

create type clinic_type as enum ('MUNICIPAL', 'PRIVATE', 'NURSING_HOME', 'OTHER');

create type clinic_role as enum ('DOCTOR', 'NURSE', 'ASSISTANT', 'ADMIN');

comment on type clinic_role is
  'ADMIN manages membership and configuration. It does NOT imply clinical access; see docs/development-foundation.md §5.';

-- ---------------------------------------------------------------------------
-- clinics
-- ---------------------------------------------------------------------------

create table clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) > 0),
  type        clinic_type not null default 'OTHER',
  -- IANA zone. Gestational age is a calendar computation; computing it in UTC
  -- for a clinic in IST shifts the displayed POG by a day near midnight.
  timezone    text        not null default 'Asia/Kolkata',
  address     text,
  contact_phone text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer     not null default 1
);

create trigger touch_clinics
  before update on clinics
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- staff_users
-- ---------------------------------------------------------------------------
-- Mirrors an auth.users row with application-facing profile data. Named
-- `staff_users` rather than `users` to keep it visibly distinct from
-- auth.users and from patients, who are not users of this system.

create table staff_users (
  id           uuid primary key default gen_random_uuid(),
  -- Supabase auth subject. Unique, and the only link to credentials.
  auth_user_id uuid not null unique references auth.users (id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) > 0),
  -- Registration/licence number, shown on printed clinical documents.
  registration_no text,
  phone        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      integer not null default 1
);

create trigger touch_staff_users
  before update on staff_users
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- clinic_memberships
-- ---------------------------------------------------------------------------

create table clinic_memberships (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics (id) on delete restrict,
  user_id    uuid not null references staff_users (id) on delete restrict,
  role       clinic_role not null,
  is_active  boolean not null default true,
  -- Audit of the grant itself: who let this person into this clinic.
  granted_by uuid references staff_users (id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  -- One membership row per person per clinic. A person needing two roles is a
  -- policy question, not something to solve by duplicating rows.
  constraint clinic_memberships_unique_pair unique (clinic_id, user_id),
  constraint clinic_memberships_revocation_consistent
    check ((is_active and revoked_at is null) or (not is_active and revoked_at is not null))
);

create index clinic_memberships_user_idx on clinic_memberships (user_id) where is_active;
create index clinic_memberships_clinic_idx on clinic_memberships (clinic_id) where is_active;

create trigger touch_clinic_memberships
  before update on clinic_memberships
  for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
-- These back the RLS policies in 0011. Application services perform their own
-- explicit permission checks as well (ARCH-5) — RLS is the floor, not the
-- whole of the authorization story.

-- The staff_users.id of the caller, or null for anonymous/public requests
-- (the tokenized referral page and the messaging webhook).
create or replace function app.current_staff_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from staff_users u
  where u.auth_user_id = auth.uid()
    and u.is_active
$$;

-- Does the caller hold an active membership in this clinic?
create or replace function app.is_clinic_member(target_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from clinic_memberships m
    join staff_users u on u.id = m.user_id
    where m.clinic_id = target_clinic
      and u.auth_user_id = auth.uid()
      and m.is_active
      and u.is_active
  )
$$;

-- Does the caller hold one of these roles in this clinic?
create or replace function app.has_clinic_role(target_clinic uuid, allowed clinic_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from clinic_memberships m
    join staff_users u on u.id = m.user_id
    where m.clinic_id = target_clinic
      and u.auth_user_id = auth.uid()
      and m.role = any(allowed)
      and m.is_active
      and u.is_active
  )
$$;

comment on function app.has_clinic_role(uuid, clinic_role[]) is
  'Role check used by RLS. Clinical verification is restricted to DOCTOR; ADMIN is deliberately excluded from clinical policies.';
