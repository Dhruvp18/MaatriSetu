-- ---------------------------------------------------------------------------
-- 0026 — Patient queries (chatbot triage log)
-- ---------------------------------------------------------------------------
-- Every question a patient submits through the mobile chatbot is stored here.
-- The clinic dashboard reads this table to review flagged queries before or
-- during a consultation. No clinical data is written here by the bot — it only
-- stores what the patient asked and what triage level was assigned.
-- ---------------------------------------------------------------------------

create type triage_level as enum ('CRITICAL', 'IMPORTANT', 'NORMAL');

create table patient_queries (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  -- Nullable: a patient may scan before a pregnancy is opened.
  pregnancy_id uuid,

  query_text   text not null check (length(btrim(query_text)) > 0),
  bot_response text not null,
  -- Declaration order is severity order, so `order by triage_level` puts
  -- CRITICAL first.
  triage_level triage_level not null,

  -- Set to true by clinic staff after they have read and acted on the query.
  is_reviewed  boolean not null default false,
  reviewed_by  uuid references staff_users (id),
  reviewed_at  timestamptz,

  created_at   timestamptz not null default now(),

  -- Restrict, like every other patient-owned table: a patient's record is
  -- never removed as a side effect.
  constraint patient_queries_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint patient_queries_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,

  constraint patient_queries_reviewed_consistent
    check ((is_reviewed = false) = (reviewed_at is null))
);

-- Clinic staff read this table to see all un-reviewed queries for their clinic.
create index patient_queries_clinic_unreviewed_idx
  on patient_queries (clinic_id, created_at desc)
  where is_reviewed = false;

-- Patient's own query history.
create index patient_queries_patient_idx
  on patient_queries (patient_id, created_at desc);

comment on table patient_queries is
  'Chatbot triage log. Written by the patient mobile interface. Read by clinic staff during consultation prep. Not a clinical record — the clinician decides what to do.';

-- ---------------------------------------------------------------------------
-- RLS — the same posture as 0012: deny by default, member-scoped read, writes
-- only through the service role. Both the patient chatbot's insert and the
-- clinic's "mark reviewed" run server-side with the service role.
-- ---------------------------------------------------------------------------

alter table patient_queries enable row level security;
alter table patient_queries force row level security;

create policy patient_queries_member_read on patient_queries
  for select to authenticated
  using (app.is_clinic_member(clinic_id));

-- 0012's blanket revoke only reached tables that existed then.
revoke all on patient_queries from anon;
