-- ---------------------------------------------------------------------------
-- 0025 — Appointments
-- ---------------------------------------------------------------------------
-- The clinic day starts from a list: who is booked today. Until now the only
-- forward-looking date was `visit_advice.next_followup_date`, written by the
-- doctor inside the consultation commit. A nurse at the counter also books
-- visits — a mother who could not come on the advised day, a scan-review slot —
-- and that booking needs a home that is not a consultation.
--
-- An appointment is a plan, not an encounter. Attending one opens a visit
-- through the normal path; nothing here creates a visit or implies one
-- happened.
-- ---------------------------------------------------------------------------

create table appointments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid,

  scheduled_on date not null,
  purpose      text,
  status       text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'CANCELLED')),

  created_by uuid not null references staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint appointments_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint appointments_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict
);

-- One live booking per patient per day. Booking her twice for the same day is
-- a double-click, not two appointments.
create unique index appointments_one_per_day_idx
  on appointments (patient_id, scheduled_on) where status = 'SCHEDULED';

create index appointments_clinic_day_idx on appointments (clinic_id, scheduled_on) where status = 'SCHEDULED';

create trigger touch_appointments
  before update on appointments
  for each row execute function app.touch_row();

alter table appointments enable row level security;
alter table appointments force row level security;
create policy appointments_member_read on appointments
  for select to authenticated using (app.is_clinic_member(clinic_id));
revoke all on appointments from anon;

-- ---------------------------------------------------------------------------
-- schedule_appointment — books a day, or moves the booking already on it
-- ---------------------------------------------------------------------------

create or replace function public.schedule_appointment(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_patient_id          uuid,
  p_pregnancy_id        uuid,
  p_scheduled_on        date,
  p_purpose             text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into appointments (clinic_id, patient_id, pregnancy_id, scheduled_on, purpose, created_by)
  values (p_clinic_id, p_patient_id, p_pregnancy_id, p_scheduled_on,
          nullif(btrim(coalesce(p_purpose, '')), ''), p_actor_staff_user_id)
  on conflict (patient_id, scheduled_on) where status = 'SCHEDULED'
  do update set purpose = coalesce(excluded.purpose, appointments.purpose)
  returning id into v_id;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'appointment.scheduled', 'appointments', v_id,
    jsonb_build_object('patient_id', p_patient_id, 'scheduled_on', p_scheduled_on, 'purpose', p_purpose)
  );

  return v_id;
end;
$$;

create or replace function public.cancel_appointment(
  p_clinic_id           uuid,
  p_actor_staff_user_id uuid,
  p_request_id          text,
  p_appointment_id      uuid
)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  update appointments set status = 'CANCELLED'
   where clinic_id = p_clinic_id and id = p_appointment_id and status = 'SCHEDULED';

  if not found then
    raise exception 'Appointment % is not scheduled at clinic %', p_appointment_id, p_clinic_id
      using errcode = 'no_data_found';
  end if;

  insert into audit_events (
    clinic_id, actor_staff_user_id, request_id,
    action, entity_table, entity_id, payload
  ) values (
    p_clinic_id, p_actor_staff_user_id, p_request_id,
    'appointment.cancelled', 'appointments', p_appointment_id, '{}'::jsonb
  );
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.schedule_appointment(uuid, uuid, text, uuid, uuid, date, text)',
    'public.cancel_appointment(uuid, uuid, text, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
