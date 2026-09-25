-- ===========================================================================
-- 0031 — master packs: a doctor's own one-click prescription sets
-- ===========================================================================
--   A master pack is a named set the doctor writes again and again — "ANC
--   profile", "Anaemia", "Pre-op routine" — holding any mix of medicine lines,
--   lab orders, scan orders, counselling points and advice. Applied in the
--   cockpit, it drops everything into today's consultation, fully editable,
--   and nothing is ordered until Save & Next.
--
--   Packs are PRIVATE to the doctor who made them. RLS lets a caller read only
--   their own packs, in a clinic they are a doctor at; nobody else in the
--   clinic, admin included, can list them. Writes go through the routines
--   below, which check ownership themselves.
--
--   A deleted pack is kept, marked deleted, so the audit trail still resolves
--   and so that "this doctor has had packs before" survives deleting them all
--   (the starter set is seeded only once, into a doctor with no packs ever).
-- ===========================================================================

create table master_packs (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics (id) on delete restrict,
  owner_staff_user_id uuid not null references staff_users (id) on delete restrict,
  name                text not null check (length(btrim(name)) between 1 and 80),
  -- Prescription lines in the consultation's own shape (medicineName, form,
  -- doseAmount, doseUnit, frequency, foodRelation, durationDays, instructions).
  -- Validated by the service; the consultation re-validates when it is saved.
  medicines           jsonb not null default '[]'::jsonb check (jsonb_typeof(medicines) = 'array'),
  lab_orders          text[] not null default '{}',
  scan_orders         text[] not null default '{}',
  -- Keys of the consultation's counselling checkboxes: DFKC, NUTRITION, ...
  counselling         text[] not null default '{}',
  advice              text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  version             integer not null default 1,

  constraint master_packs_not_empty check (
    deleted_at is not null
    or jsonb_array_length(medicines) > 0
    or cardinality(lab_orders) > 0
    or cardinality(scan_orders) > 0
    or cardinality(counselling) > 0
    or length(btrim(coalesce(advice, ''))) > 0
  )
);

-- Two live packs with the same name would be indistinguishable on the strip.
create unique index master_packs_owner_name_uq
  on master_packs (clinic_id, owner_staff_user_id, lower(btrim(name)))
  where deleted_at is null;

create index master_packs_owner_idx
  on master_packs (owner_staff_user_id, clinic_id, created_at)
  where deleted_at is null;

create trigger touch_master_packs
  before update on master_packs
  for each row execute function app.touch_row();

alter table master_packs enable row level security;
alter table master_packs force row level security;

create policy master_packs_owner_read on master_packs
  for select to authenticated
  using (
    owner_staff_user_id = app.current_staff_user_id()
    and app.has_clinic_role(clinic_id, array['DOCTOR']::clinic_role[])
  );

revoke all on master_packs from anon;

-- ---------------------------------------------------------------------------
-- save_master_pack — insert (p_pack_id null) or version-checked update
-- ---------------------------------------------------------------------------

create or replace function public.save_master_pack(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pack_id             uuid,
  p_expected_version    integer,
  p_pack                jsonb
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id  uuid;
  v_row record;
begin
  if p_pack_id is null then
    -- Every column in the insert itself: the not-empty check runs on insert.
    insert into master_packs (
      clinic_id, owner_staff_user_id, name, medicines, lab_orders, scan_orders, counselling, advice
    ) values (
      p_clinic_id, p_actor_staff_user_id, btrim(p_pack ->> 'name'),
      coalesce(p_pack -> 'medicines', '[]'::jsonb),
      coalesce(array(select jsonb_array_elements_text(p_pack -> 'labOrders')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_pack -> 'scanOrders')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_pack -> 'counselling')), '{}'),
      nullif(btrim(coalesce(p_pack ->> 'advice', '')), '')
    )
    returning id into v_id;
  else
    -- Another doctor's pack reads as not found: its existence is not theirs to learn.
    select * into v_row
      from master_packs
     where clinic_id = p_clinic_id and id = p_pack_id
       and owner_staff_user_id = p_actor_staff_user_id and deleted_at is null
     for update;

    if not found then
      raise exception 'Master pack % not found', p_pack_id using errcode = 'no_data_found';
    end if;

    if v_row.version <> p_expected_version then
      raise exception 'Master pack % changed while it was being edited (expected version %, found %).',
        p_pack_id, p_expected_version, v_row.version
        using errcode = 'serialization_failure';
    end if;

    v_id := p_pack_id;

    update master_packs
       set name        = btrim(p_pack ->> 'name'),
           medicines   = coalesce(p_pack -> 'medicines', '[]'::jsonb),
           lab_orders  = coalesce(array(select jsonb_array_elements_text(p_pack -> 'labOrders')), '{}'),
           scan_orders = coalesce(array(select jsonb_array_elements_text(p_pack -> 'scanOrders')), '{}'),
           counselling = coalesce(array(select jsonb_array_elements_text(p_pack -> 'counselling')), '{}'),
           advice      = nullif(btrim(coalesce(p_pack ->> 'advice', '')), '')
     where id = v_id;
  end if;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    case when p_pack_id is null then 'master_pack.created' else 'master_pack.updated' end,
    'master_packs', v_id,
    jsonb_build_object('pack', p_pack,
                       'previous', case when p_pack_id is null then null else to_jsonb(v_row) end)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_master_pack — soft delete, owner only; deleting twice is a no-op
-- ---------------------------------------------------------------------------

create or replace function public.delete_master_pack(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_pack_id             uuid,
  p_expected_version    integer
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  select * into v_row
    from master_packs
   where clinic_id = p_clinic_id and id = p_pack_id and owner_staff_user_id = p_actor_staff_user_id
   for update;

  if not found then
    raise exception 'Master pack % not found', p_pack_id using errcode = 'no_data_found';
  end if;

  if v_row.deleted_at is not null then
    return;
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'Master pack % changed while it was being edited (expected version %, found %).',
      p_pack_id, p_expected_version, v_row.version
      using errcode = 'serialization_failure';
  end if;

  update master_packs set deleted_at = now() where id = p_pack_id;

  insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
  values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'master_pack.deleted', 'master_packs', p_pack_id,
          jsonb_build_object('previous', to_jsonb(v_row)));
end;
$$;

-- ---------------------------------------------------------------------------
-- seed_master_packs — the starter set, once, into a doctor who has never had a pack
-- ---------------------------------------------------------------------------
-- Idempotent under concurrency: two cockpits opening at once take the same
-- advisory lock, and the second finds the first one's rows.

create or replace function public.seed_master_packs(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_packs               jsonb
)
returns integer
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_pack  jsonb;
  v_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('master_packs:' || p_clinic_id || ':' || p_actor_staff_user_id, 0));

  if exists (
    select 1 from master_packs
     where clinic_id = p_clinic_id and owner_staff_user_id = p_actor_staff_user_id
  ) then
    return 0;
  end if;

  for v_pack in select * from jsonb_array_elements(coalesce(p_packs, '[]'::jsonb))
  loop
    insert into master_packs (
      clinic_id, owner_staff_user_id, name, medicines, lab_orders, scan_orders, counselling, advice
    ) values (
      p_clinic_id, p_actor_staff_user_id, btrim(v_pack ->> 'name'),
      coalesce(v_pack -> 'medicines', '[]'::jsonb),
      coalesce(array(select jsonb_array_elements_text(v_pack -> 'labOrders')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_pack -> 'scanOrders')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_pack -> 'counselling')), '{}'),
      nullif(btrim(coalesce(v_pack ->> 'advice', '')), '')
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into audit_events (clinic_id, actor_staff_user_id, request_id, action, entity_table, entity_id, payload)
    values (p_clinic_id, p_actor_staff_user_id, p_request_id, 'master_pack.seeded', 'master_packs', null,
            jsonb_build_object('count', v_count));
  end if;

  return v_count;
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
    'public.save_master_pack(uuid, uuid, text, uuid, integer, jsonb)',
    'public.delete_master_pack(uuid, uuid, text, uuid, integer)',
    'public.seed_master_packs(uuid, uuid, text, jsonb)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
