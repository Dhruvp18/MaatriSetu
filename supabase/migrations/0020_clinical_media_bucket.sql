-- ---------------------------------------------------------------------------
-- 0020 — Private storage for clinical media
-- ---------------------------------------------------------------------------
-- One bucket holds everything a patient's record accumulates as files: voice
-- notes, photographed lab slips, ultrasound images.
--
-- PRIVATE, with no policies on storage.objects. That combination means only the
-- service role can read or write it, which is the same posture migration 0012
-- takes for the write routines: a browser session never touches these objects
-- directly. A public bucket would put a permanent, unauthenticated URL on every
-- lab slip in the clinic, and a leaked object key would be enough to read a
-- patient's results forever.
--
-- Where a file must genuinely reach a browser — a clinician opening the
-- original slip beside an extracted value — the server mints a short-lived
-- signed URL for that one object.
--
-- Guarded on the storage schema existing, because `pnpm verify:schema` runs
-- against a plain postgres image where Supabase's storage schema is absent.
-- Skipping there is correct: the bucket is infrastructure, not schema, and the
-- invariants that script checks do not depend on it.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema absent (local verification run) — skipping bucket creation';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'clinical-media',
    'clinical-media',
    false,
    -- 15 MB. A voice note is seconds long and a phone photograph of a lab slip
    -- is a couple of megabytes; anything larger is a mistake worth rejecting at
    -- the door rather than storing.
    15728640,
    array[
      -- Voice notes, in the formats phones and WhatsApp actually produce.
      'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/m4a',
      'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/amr',
      -- Photographed slips and scans.
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'
    ]
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;
