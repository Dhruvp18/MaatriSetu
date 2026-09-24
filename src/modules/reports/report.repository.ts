import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { internal, notFound, retryable } from '@core/errors/app-error'

import {
  type ExtractionRunRow,
  type ObservationRow,
  type ReportCandidateRow,
  type ReportUploadRow,
  type ScanReportRow,
  toObservation,
  toReportUpload,
  toScanReport,
} from './report.mapper'
import type { Observation, ReportUpload, ScanReport } from './report.types'

/**
 * The only place that talks to the database about results.
 *
 * Reads of `observations` and `scan_reports` are read-only here by design:
 * those rows are created by clinician verification inside the consultation
 * commit, and there is deliberately no write path to them in this file.
 *
 * The ingestion tiers do have writes, and every one of them goes through a
 * routine from migration 0022 so that the row and its audit land in the same
 * transaction.
 *
 * Every verified-result query filters `superseded_at is null`. A correction
 * supersedes rather than overwrites, so without that filter the cockpit would
 * show both the mistaken value and its correction side by side with nothing to
 * tell them apart.
 */

type Fn = Database['public']['Functions']

/**
 * The generator types every routine argument as non-nullable.
 *
 * Several of ours legitimately take null — an upload with no pregnancy, a
 * candidate with no printed date — so the nullable members are restored here
 * rather than by passing `null as never` at each call site.
 */
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

const PG_NO_DATA_FOUND = 'P0002'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_NO_DATA_FOUND) {
    throw notFound('That report is not recorded at this clinic.')
  }
  // Connection-level failures are worth retrying; a malformed query is not.
  if (error.code === undefined || error.code.startsWith('08')) {
    throw retryable(`Could not reach the database (${operation}).`, error)
  }
  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Pins                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which results the clinician has pinned to the cockpit.
 *
 * Returned as two sets of ids, used only to mark rows for display. Never used
 * to filter what is fetched — pinning decides what is surfaced first, not what
 * exists (see `TrendSeries`).
 */
export async function findActivePins(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<{ observationIds: Set<string>; scanIds: Set<string> }> {
  const { data, error } = await db
    .from('finding_pins')
    .select('observation_id, scan_report_id')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('unpinned_at', null)

  if (error) translate(error, 'findActivePins')

  const observationIds = new Set<string>()
  const scanIds = new Set<string>()

  for (const row of data ?? []) {
    if (row.observation_id) observationIds.add(row.observation_id)
    if (row.scan_report_id) scanIds.add(row.scan_report_id)
  }

  return { observationIds, scanIds }
}

/* -------------------------------------------------------------------------- */
/* Observations                                                               */
/* -------------------------------------------------------------------------- */

/** Every current verified observation for a pregnancy, newest first. */
export async function listObservations(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
  pinnedIds: ReadonlySet<string>,
): Promise<Observation[]> {
  const { data, error } = await db
    .from('observations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('superseded_at', null)
    .order('observed_date', { ascending: false })

  if (error) translate(error, 'listObservations')

  return (data as ObservationRow[] | null ?? []).map((row) => toObservation(row, pinnedIds))
}

/* -------------------------------------------------------------------------- */
/* Scans                                                                      */
/* -------------------------------------------------------------------------- */

/** Every current verified scan for a pregnancy, most recent study first. */
export async function listScans(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
  pinnedIds: ReadonlySet<string>,
): Promise<ScanReport[]> {
  const { data, error } = await db
    .from('scan_reports')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('superseded_at', null)
    // Ordered by the date the study was performed, never by when it was
    // uploaded — a scan photographed weeks late still belongs where it happened.
    .order('scan_date', { ascending: false })

  if (error) translate(error, 'listScans')

  return (data as ScanReportRow[] | null ?? []).map((row) => toScanReport(row, pinnedIds))
}

/* -------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* -------------------------------------------------------------------------- */

/** Every document attached to one pregnancy, newest first. */
export async function listUploadsForPregnancy(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<ReportUploadRow[]> {
  const { data, error } = await db
    .from('report_uploads')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    // Quarantined slips are excluded from every clinical view. A suspected
    // wrong-patient document must not appear on the patient it was wrongly
    // attached to while somebody works out whose it really is.
    .neq('assignment_status', 'QUARANTINED')
    .order('uploaded_at', { ascending: false })

  if (error) translate(error, 'listUploadsForPregnancy')

  return (data as ReportUploadRow[] | null) ?? []
}

/** Documents nobody has attached to an episode yet. The counter's inbox. */
export async function listInbox(
  db: TypedClient,
  clinicId: string,
  limit: number,
): Promise<ReportUploadRow[]> {
  const { data, error } = await db
    .from('report_uploads')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('assignment_status', 'UNASSIGNED')
    .order('uploaded_at', { ascending: false })
    .limit(limit)

  if (error) translate(error, 'listInbox')

  return (data as ReportUploadRow[] | null) ?? []
}

/**
 * Which clinic an upload belongs to.
 *
 * Only the worker needs this. It holds no session and therefore no clinic, and
 * every routine it then calls is scoped by the id this returns — so a bug here
 * fails to find the row rather than writing into another clinic's tenant.
 */
export async function findClinicIdForUpload(
  db: TypedClient,
  uploadId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('report_uploads')
    .select('clinic_id')
    .eq('id', uploadId)
    .maybeSingle()

  if (error) translate(error, 'findClinicIdForUpload')

  return data?.clinic_id ?? null
}

export async function findUploadById(
  db: TypedClient,
  clinicId: string,
  uploadId: string,
): Promise<ReportUpload | null> {
  const { data, error } = await db
    .from('report_uploads')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', uploadId)
    .maybeSingle()

  if (error) translate(error, 'findUploadById')

  return data ? toReportUpload(data as ReportUploadRow) : null
}

/**
 * Error codes worth trying again.
 *
 * A rate limit or a timeout says nothing about the photograph. A refusal or an
 * unsupported image says everything about it, and retrying those burns money to
 * reach the same answer while the slip sits on screen looking busy — when what
 * the assistant actually needs to be told is to take it again.
 */
const RETRYABLE_ERROR_CODES = new Set([
  'RATE_LIMIT',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'IMAGE_UNREADABLE',
])

/** Attempts per upload before it is left alone for a human to look at. */
const MAX_ATTEMPTS = 3

/**
 * How long a PROCESSING run may sit before it is presumed abandoned.
 *
 * A worker killed mid-call leaves a run that never completes and an upload that
 * nothing will ever pick up again. Generous enough that a genuinely slow vision
 * call is never read as dead and charged for twice.
 */
const ABANDONED_AFTER_MS = 10 * 60 * 1000

/**
 * Work for the extraction worker.
 *
 * The state of an upload's runs IS the queue. There is no "queued" column on
 * `report_uploads`, because a second record of the same fact can disagree with
 * the first — and the way it would disagree is a slip marked done that no model
 * ever read.
 *
 * An upload is due when it has no run at all, when its last attempt failed for
 * a reason worth retrying, or when an attempt has been PROCESSING long enough
 * to be presumed abandoned. Anything else — read successfully, refused, out of
 * attempts, genuinely in flight — is left alone.
 *
 * A document a clinician has already dealt with is excluded outright, whatever
 * its runs say. Reading it again would propose fresh candidates for values that
 * are already verified facts, and offer a doctor the same haemoglobin twice.
 * That is also what keeps the seeded history — eight uploads that back the
 * demo's observations and have no image behind them — out of the queue instead
 * of failing on every tick forever.
 *
 * Done as two queries and a set difference rather than a NOT EXISTS, because
 * PostgREST cannot express an anti-join. That is affordable only while the
 * window stays bounded, which is why it is: at real volume this becomes a view,
 * and this function is the only thing that has to change.
 */
export async function listAwaitingExtraction(
  db: TypedClient,
  limit: number,
): Promise<ReportUploadRow[]> {
  const window = Math.max(limit * 10, 50)

  const { data, error } = await db
    .from('report_uploads')
    .select('*')
    // Oldest first: a slip photographed twenty minutes ago is the one somebody
    // is waiting on.
    .order('uploaded_at', { ascending: true })
    .limit(window)

  if (error) translate(error, 'listAwaitingExtraction')

  const uploads = (data as ReportUploadRow[] | null) ?? []
  if (uploads.length === 0) return []

  const ids = uploads.map((upload) => upload.id)

  const [runsResult, observed, scanned, reviewed] = await Promise.all([
    db
      .from('extraction_runs')
      .select('upload_id, attempt_no, status, error_code, started_at')
      .in('upload_id', ids)
      .order('attempt_no', { ascending: false }),
    db.from('observations').select('source_upload_id').in('source_upload_id', ids),
    db.from('scan_reports').select('source_upload_id').in('source_upload_id', ids),
    db.from('report_reviews').select('upload_id').in('upload_id', ids),
  ])

  if (runsResult.error) translate(runsResult.error, 'listAwaitingExtraction')

  const settled = new Set<string>()
  for (const row of observed.data ?? []) {
    if (row.source_upload_id) settled.add(row.source_upload_id)
  }
  for (const row of scanned.data ?? []) {
    if (row.source_upload_id) settled.add(row.source_upload_id)
  }
  for (const row of reviewed.data ?? []) settled.add(row.upload_id)

  const rows = runsResult.data ?? []

  // Newest attempt first, so the first row seen for an upload is the one that
  // decides whether it is due.
  const latest = new Map<string, (typeof rows)[number]>()
  for (const run of rows) {
    if (!latest.has(run.upload_id)) latest.set(run.upload_id, run)
  }

  const now = Date.now()

  const due = uploads.filter((upload) => {
    // Already verified or already decided on. Nothing a second reading could
    // produce would be wanted.
    if (settled.has(upload.id)) return false

    const run = latest.get(upload.id)
    if (!run) return true

    if (run.attempt_no >= MAX_ATTEMPTS) return false

    if (run.status === 'FAILED') {
      return RETRYABLE_ERROR_CODES.has(run.error_code ?? 'UNKNOWN')
    }

    if (run.status === 'PROCESSING') {
      const started = run.started_at ? Date.parse(run.started_at) : now
      return now - started > ABANDONED_AFTER_MS
    }

    // QUEUED, NEEDS_CORRECTION and READY_FOR_REVIEW are all states a worker
    // must not act on: the first two belong to a run already claimed, and the
    // third is finished.
    return false
  })

  return due.slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* Extraction runs and candidates                                             */
/* -------------------------------------------------------------------------- */

/**
 * The newest run for each of these uploads, with its candidates.
 *
 * Only the newest: a retry is a new run rather than an edit, so an upload that
 * failed once and succeeded on the second attempt must show the success. Every
 * earlier attempt stays in the table for the day a value is disputed.
 */
export async function loadLatestRuns(
  db: TypedClient,
  clinicId: string,
  uploadIds: readonly string[],
): Promise<Map<string, { run: ExtractionRunRow; candidates: ReportCandidateRow[] }>> {
  const byUpload = new Map<string, { run: ExtractionRunRow; candidates: ReportCandidateRow[] }>()
  if (uploadIds.length === 0) return byUpload

  const { data, error } = await db
    .from('extraction_runs')
    .select('*')
    .eq('clinic_id', clinicId)
    .in('upload_id', [...uploadIds])
    .order('attempt_no', { ascending: false })

  if (error) translate(error, 'loadLatestRuns')

  // Ordered newest attempt first, so the first row seen for an upload is the
  // one that counts and later ones are earlier attempts.
  for (const run of (data as ExtractionRunRow[] | null) ?? []) {
    if (!byUpload.has(run.upload_id)) byUpload.set(run.upload_id, { run, candidates: [] })
  }

  const runIds = [...byUpload.values()].map((entry) => entry.run.id)
  if (runIds.length === 0) return byUpload

  const { data: candidates, error: candidatesError } = await db
    .from('report_candidates')
    .select('*')
    .eq('clinic_id', clinicId)
    .in('extraction_run_id', runIds)
    .order('created_at', { ascending: true })

  if (candidatesError) translate(candidatesError, 'loadLatestRuns')

  const byRun = new Map(runIds.map((id) => [id, [] as ReportCandidateRow[]]))
  for (const candidate of (candidates as ReportCandidateRow[] | null) ?? []) {
    byRun.get(candidate.extraction_run_id)?.push(candidate)
  }

  for (const entry of byUpload.values()) {
    entry.candidates = byRun.get(entry.run.id) ?? []
  }

  return byUpload
}

/**
 * When each of these uploads was last reviewed by a clinician.
 *
 * Absence is what keeps a verified slip from being offered again at the next
 * consultation, and presence is what stops one being verified twice.
 */
export async function findReviewTimes(
  db: TypedClient,
  clinicId: string,
  uploadIds: readonly string[],
): Promise<Map<string, string>> {
  const reviewed = new Map<string, string>()
  if (uploadIds.length === 0) return reviewed

  const { data, error } = await db
    .from('report_reviews')
    .select('upload_id, reviewed_at')
    .eq('clinic_id', clinicId)
    .in('upload_id', [...uploadIds])
    .order('reviewed_at', { ascending: false })

  if (error) translate(error, 'findReviewTimes')

  for (const row of data ?? []) {
    if (!reviewed.has(row.upload_id)) reviewed.set(row.upload_id, row.reviewed_at)
  }

  return reviewed
}

/* -------------------------------------------------------------------------- */
/* Writes — every one of these persists and audits in one transaction         */
/* -------------------------------------------------------------------------- */

type RecordUploadArgs = Nullable<
  Fn['record_report_upload']['Args'],
  'p_pregnancy_id' | 'p_visit_id' | 'p_actor_staff_user_id'
>

/**
 * The photograph arrives. Carries no clinical meaning, and may have no episode.
 *
 * A null actor is the patient uploading her own slip through the portal; the
 * routine audits it as `patient-portal` (migration 0027).
 */
export async function recordUpload(
  db: TypedClient,
  input: {
    clinicId: string
    actorStaffUserId: string | null
    requestId: string
    patientId: string
    pregnancyId: string | null
    visitId: string | null
    objectKey: string
    contentType: string
    byteSize: number
    sha256Hex: string
  },
): Promise<string> {
  const args: RecordUploadArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_patient_id: input.patientId,
    p_pregnancy_id: input.pregnancyId,
    p_visit_id: input.visitId,
    p_object_key: input.objectKey,
    p_content_type: input.contentType,
    p_byte_size: input.byteSize,
    // Postgres accepts a hex string for bytea through this encoding.
    p_sha256: `\\x${input.sha256Hex}`,
  }

  const { data, error } = await db.rpc(
    'record_report_upload',
    args as Fn['record_report_upload']['Args'],
  )

  if (error) translate(error, 'recordUpload')

  return data as string
}

/** Begin an attempt. A retry is a new run, never an edit of the old one. */
export async function startExtractionRun(
  db: TypedClient,
  input: {
    clinicId: string
    worker: string
    requestId: string
    uploadId: string
    provider: string
    model: string
    promptVersion: string
  },
): Promise<string | null> {
  // Null: another invocation holds a live run for this upload (migration 0028).
  const { data, error } = await db.rpc('start_extraction_run', {
    p_clinic_id: input.clinicId,
    p_worker: input.worker,
    p_request_id: input.requestId,
    p_upload_id: input.uploadId,
    p_provider: input.provider,
    p_model: input.model,
    p_prompt_version: input.promptVersion,
  })

  if (error) translate(error, 'startExtractionRun')

  return typeof data === 'string' ? data : null
}

type CompleteRunArgs = Fn['complete_extraction_run']['Args']

/** Store the verbatim output and the parsed candidates. Still not facts. */
export async function completeExtractionRun(
  db: TypedClient,
  input: {
    clinicId: string
    worker: string
    requestId: string
    runId: string
    rawOutput: unknown
    reportType: CompleteRunArgs['p_report_type']
    candidates: unknown
  },
): Promise<number> {
  const args: CompleteRunArgs = {
    p_clinic_id: input.clinicId,
    p_worker: input.worker,
    p_request_id: input.requestId,
    p_run_id: input.runId,
    p_raw_output: input.rawOutput as never,
    p_report_type: input.reportType,
    p_candidates: input.candidates as never,
  }

  const { data, error } = await db.rpc('complete_extraction_run', args)

  if (error) translate(error, 'completeExtractionRun')

  return (data as number | null) ?? 0
}

type FailRunArgs = Nullable<Fn['fail_extraction_run']['Args'], 'p_error'>

export async function failExtractionRun(
  db: TypedClient,
  input: {
    clinicId: string
    worker: string
    requestId: string
    runId: string
    errorCode: string
    errorMessage: string | null
  },
): Promise<void> {
  const args: FailRunArgs = {
    p_clinic_id: input.clinicId,
    p_worker: input.worker,
    p_request_id: input.requestId,
    p_run_id: input.runId,
    p_error_code: input.errorCode,
    p_error: input.errorMessage,
  }

  const { error } = await db.rpc(
    'fail_extraction_run',
    args as Fn['fail_extraction_run']['Args'],
  )

  if (error) translate(error, 'failExtractionRun')
}

type CorrectCandidateArgs = Nullable<
  Fn['correct_report_candidate']['Args'],
  'p_value_numeric' | 'p_value_text' | 'p_unit' | 'p_observed_date'
>

/** Staff fixing a misread digit. Records a version; does not make it true. */
export async function correctCandidate(
  db: TypedClient,
  input: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    candidateId: string
    valueNumeric: number | null
    valueText: string | null
    unit: string | null
    observedDate: string | null
    discard: boolean
  },
): Promise<number> {
  const args: CorrectCandidateArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_candidate_id: input.candidateId,
    p_value_numeric: input.valueNumeric,
    p_value_text: input.valueText,
    p_unit: input.unit,
    p_observed_date: input.observedDate,
    p_discard: input.discard,
  }

  const { data, error } = await db.rpc(
    'correct_report_candidate',
    args as Fn['correct_report_candidate']['Args'],
  )

  if (error) translate(error, 'correctCandidate')

  return (data as number | null) ?? 0
}

type AssignUploadArgs = Nullable<
  Fn['assign_report_upload']['Args'],
  'p_pregnancy_id' | 'p_quarantine_reason'
>

/** Attach an inbox slip to an episode, or quarantine a wrong-patient one. */
export async function assignUpload(
  db: TypedClient,
  input: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    uploadId: string
    pregnancyId: string | null
    quarantineReason: string | null
  },
): Promise<void> {
  const args: AssignUploadArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_upload_id: input.uploadId,
    p_pregnancy_id: input.pregnancyId,
    p_quarantine_reason: input.quarantineReason,
  }

  const { error } = await db.rpc(
    'assign_report_upload',
    args as Fn['assign_report_upload']['Args'],
  )

  if (error) translate(error, 'assignUpload')
}
