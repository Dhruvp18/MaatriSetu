-- ---------------------------------------------------------------------------
-- 0028 — Queue processing without a long-running worker
-- ---------------------------------------------------------------------------
-- The queues (voice transcription, report extraction) used to be drained by
-- one always-on poll loop. On a free hosting tier they are drained instead by
-- short-lived serverless invocations: one fired right after an upload, and one
-- every minute from pg_cron as the safety net.
--
-- Two invocations can now overlap, so picking up an item has to be a claim,
-- not a read-then-act:
--
--   1. start_extraction_run takes a per-upload lock and refuses (returns null)
--      while a live PROCESSING run exists. "Live" matches the application's
--      ABANDONED_AFTER_MS: a run older than ten minutes is a crashed call and
--      may be retried.
--
--   2. claim_voice_transcription moves a note to TRANSCRIBING atomically, with
--      the same ten-minute lease so a note whose invocation died is picked up
--      again rather than stuck "in flight" forever.
--
--   3. app.trigger_queue_drain() + a pg_cron job call the app's drain endpoint
--      every minute. The URL and secret live in Supabase Vault, never in this
--      file; until both are set the job is a no-op.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Extraction: claim or refuse
-- ---------------------------------------------------------------------------

create or replace function public.start_extraction_run(
  p_clinic_id      uuid,
  p_worker         text,
  p_request_id     text,
  p_upload_id      uuid,
  p_provider       text,
  p_model          text,
  p_prompt_version text
)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_attempt integer;
  v_id      uuid;
begin
  -- Serialises claimants for this upload until commit. Without it, two
  -- invocations both see "no live run" and both call the model.
  perform pg_advisory_xact_lock(hashtextextended(p_upload_id::text, 0));

  if exists (
    select 1 from extraction_runs
     where upload_id = p_upload_id
       and status = 'PROCESSING'
       and started_at > now() - interval '10 minutes'
  ) then
    return null;
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_attempt
  from extraction_runs
  where upload_id = p_upload_id;

  insert into extraction_runs (
    clinic_id, upload_id, provider, model, prompt_version,
    status, attempt_no, started_at
  ) values (
    p_clinic_id, p_upload_id, p_provider, p_model, p_prompt_version,
    'PROCESSING', v_attempt, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Voice: claim with a lease
-- ---------------------------------------------------------------------------

create or replace function public.claim_voice_transcription(
  p_clinic_id      uuid,
  p_worker         text,
  p_request_id     text,
  p_voice_query_id uuid
)
returns boolean
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  update voice_queries
     set processing_state = 'TRANSCRIBING',
         updated_at       = now()
   where clinic_id = p_clinic_id
     and id = p_voice_query_id
     and (
       processing_state in ('RECEIVED', 'QUEUED')
       or (processing_state = 'TRANSCRIBING' and updated_at < now() - interval '10 minutes')
     );

  return found;
end;
$$;

revoke all on function public.claim_voice_transcription(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_voice_transcription(uuid, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. The once-a-minute safety net
-- ---------------------------------------------------------------------------
-- Vault secrets (set once per environment, see docs/DEPLOY_AGENT_PROMPT.md):
--   queue_drain_url     https://<app>/api/queue/drain
--   queue_drain_secret  the same value as the app's QUEUE_DRAIN_SECRET

create or replace function app.trigger_queue_drain()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'queue_drain_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'queue_drain_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  -- Asynchronous: pg_net queues the request and returns at once. The endpoint
  -- answers 202 immediately and does its work after responding.
  perform net.http_post(
    url                  := v_url,
    headers              := jsonb_build_object(
                              'Authorization', 'Bearer ' || v_secret,
                              'Content-Type', 'application/json'),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function app.trigger_queue_drain() from public, anon, authenticated;

-- pg_cron and pg_net exist on Supabase but not on the plain Postgres that
-- `pnpm verify:schema` uses, so the schedule is created only where they do.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;

    -- Same name replaces an existing schedule, so re-running is safe.
    perform cron.schedule('maatrisetu-queue-drain', '* * * * *', 'select app.trigger_queue_drain()');
  end if;
end;
$$;
