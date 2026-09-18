-- ---------------------------------------------------------------------------
-- 0007 — Ultrasound reports
-- ---------------------------------------------------------------------------
-- Scans are kept out of `observations` on purpose. A scan is a report with a
-- narrative and a set of co-dependent measurements read at one sitting; shredding
-- it into independent key/value rows loses the fact that EFW, AFI, presentation
-- and placental position were all observed together on the same study.
--
-- The scan date is the date of the STUDY, not the date the photograph reached
-- the clinic. PRD §8's `gestational_week int` with values "12 / 20 / 32 / 36"
-- recorded the milestone slot rather than reality; a TIFFA performed at 21w+3d
-- is extremely common and must not be stored as "20".
-- ---------------------------------------------------------------------------

create type scan_type as enum (
  'DATING',          -- early, establishes or confirms dating
  'NT_NB',           -- nuchal translucency / nasal bone
  'TIFFA',           -- targeted imaging for fetal anomalies
  'GROWTH',
  'GROWTH_DOPPLER',
  'BPP',             -- biophysical profile
  'OTHER'
);

create type fetal_presentation as enum (
  'CEPHALIC', 'BREECH', 'TRANSVERSE', 'OBLIQUE', 'UNSTABLE', 'NOT_ASSESSED'
);

create table scan_reports (
  id           uuid not null default gen_random_uuid(),
  clinic_id    uuid not null,
  patient_id   uuid not null,
  pregnancy_id uuid not null,

  source_upload_id uuid,

  scan_type scan_type not null default 'OTHER',
  -- Date the study was performed.
  scan_date date not null,
  scan_date_precision date_precision not null default 'DAY',
  -- Gestational age at the study, in days. Stored because the report states it
  -- and because it may differ from this system's dating reference.
  ga_days_at_scan integer check (ga_days_at_scan between 0 and 350),

  performed_at_facility text,

  -- Structured measurements. All optional: a dating scan has no EFW, and a
  -- growth scan may not report every parameter.
  efw_grams        integer check (efw_grams between 50 and 7000),
  efw_centile      numeric(5,2) check (efw_centile between 0 and 100),
  afi_cm           numeric(4,1) check (afi_cm between 0 and 50),
  deepest_pocket_cm numeric(4,1) check (deepest_pocket_cm between 0 and 30),
  presentation     fetal_presentation not null default 'NOT_ASSESSED',
  placenta_position text,
  placenta_grade    integer check (placenta_grade between 0 and 3),
  cervical_length_mm numeric(5,1) check (cervical_length_mm between 0 and 80),
  fetal_heart_rate_bpm integer check (fetal_heart_rate_bpm between 60 and 240),

  -- Doppler indices, when performed.
  umbilical_artery_pi numeric(5,2),
  umbilical_artery_ri numeric(5,2),
  middle_cerebral_artery_pi numeric(5,2),

  -- The radiologist's narrative, verbatim. Not parsed into structure.
  findings    text,
  impression  text,

  source data_source not null default 'EXTRACTED_VERIFIED',

  -- Like observations, a scan enters the record only by clinician verification.
  verified_by uuid not null references staff_users (id),
  verified_at timestamptz not null default now(),

  supersedes_id uuid,
  superseded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer not null default 1,

  constraint scan_reports_pkey primary key (id),
  constraint scan_reports_tenant_key unique (clinic_id, id),
  constraint scan_reports_patient_fk
    foreign key (clinic_id, patient_id) references patients (clinic_id, id) on delete restrict,
  constraint scan_reports_pregnancy_fk
    foreign key (clinic_id, pregnancy_id) references pregnancies (clinic_id, id) on delete restrict,
  constraint scan_reports_upload_fk
    foreign key (clinic_id, source_upload_id) references report_uploads (clinic_id, id) on delete restrict,
  constraint scan_reports_supersedes_fk
    foreign key (clinic_id, supersedes_id) references scan_reports (clinic_id, id) on delete restrict,
  -- Either a deepest pocket or an AFI is recorded for liquor; neither is fine.
  constraint scan_reports_extracted_has_provenance
    check (source <> 'EXTRACTED_VERIFIED' or source_upload_id is not null)
);

create index scan_reports_pregnancy_idx
  on scan_reports (pregnancy_id, scan_date desc) where superseded_at is null;

create trigger touch_scan_reports
  before update on scan_reports
  for each row execute function app.touch_row();

-- Complete the finding_pins target FK now that scan_reports exists.
alter table finding_pins
  add constraint finding_pins_scan_fk
  foreign key (clinic_id, scan_report_id) references scan_reports (clinic_id, id) on delete restrict;

create unique index finding_pins_unique_active_scan_idx
  on finding_pins (scan_report_id) where unpinned_at is null and scan_report_id is not null;

comment on column scan_reports.presentation is
  'Recorded on the scan, and displayed with the scan. Deliberately not promoted to the persistent header banner (PRD F3): presentation before term changes and a stale header value invites misreading.';
