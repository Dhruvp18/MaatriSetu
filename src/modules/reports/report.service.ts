import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { ocrIsFixture, ocrProvider } from '@core/ocr'
import { getObject, putObject, signedUrl } from '@core/storage/clinical-media'

import { toExtractionState, toReportUpload, toTrendSeries } from './report.mapper'
import * as repo from './report.repository'
import {
  AssignUploadSchema,
  CorrectCandidateSchema,
  UploadReportSchema,
} from './report.schema'
import type {
  Observation,
  PregnancyResults,
  ReportWithExtraction,
  ScanReport,
  TrendSeries,
} from './report.types'

/**
 * The reports module's public API.
 *
 * Reads run as the signed-in user, so RLS applies as an independent second
 * check: a bug here that let another clinic's pregnancy id through would still
 * return nothing.
 *
 * ---------------------------------------------------------------------------
 * The one function that is not here
 * ---------------------------------------------------------------------------
 * There is no `verify`. A candidate becomes an observation inside
 * `save_visit_consultation` and nowhere else, so the verification path lives in
 * the visits module with the rest of the consultation commit. A verify function
 * in this file would write before the save and survive its failure, leaving
 * verified results attached to a consultation that was never recorded.
 *
 * What this module does is get documents in, get a machine's reading of them,
 * and let staff correct that reading. None of it touches a patient's history.
 */

/**
 * Everything the cockpit's results accordions need, in one call.
 *
 * One call rather than three, because the cockpit must render in a single round
 * trip (PRD §9) and because the trend has to be derived from the same
 * observation set that the table shows. Fetching them separately invites a
 * screen whose sparkline and whose table disagree.
 */
export async function getPregnancyResults(
  actor: ActorContext,
  pregnancyId: string,
): Promise<PregnancyResults> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()

  // Pins are fetched first and then applied as a display flag. They are
  // deliberately not a filter: the trend below is built from every current
  // verified observation, so an unpinned normal value still bends the line.
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)

  const [observations, scans] = await Promise.all([
    repo.listObservations(db, actor.clinicId, pregnancyId, pins.observationIds),
    repo.listScans(db, actor.clinicId, pregnancyId, pins.scanIds),
  ])

  return {
    observations,
    scans,
    trends: toTrendSeries(observations),
  }
}

/** Current verified observations for a pregnancy, newest first. */
export async function listObservations(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Observation[]> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)
  return repo.listObservations(db, actor.clinicId, pregnancyId, pins.observationIds)
}

/** Current verified scans for a pregnancy, most recent study first. */
export async function listScans(
  actor: ActorContext,
  pregnancyId: string,
): Promise<ScanReport[]> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)
  return repo.listScans(db, actor.clinicId, pregnancyId, pins.scanIds)
}

/**
 * The serial values for one test, oldest first.
 *
 * Built from every current verified observation with that code. Pinning does
 * not narrow it — see `TrendSeries` for why that distinction is the whole
 * reason `observations` and `finding_pins` are separate tables.
 */
export async function getTrend(
  actor: ActorContext,
  pregnancyId: string,
  testCode: string,
): Promise<TrendSeries | null> {
  const observations = await listObservations(actor, pregnancyId)
  return toTrendSeries(observations).find((series) => series.testCode === testCode) ?? null
}

/* -------------------------------------------------------------------------- */
/* Ingestion — documents, not facts                                           */
/* -------------------------------------------------------------------------- */

/** Where a photographed slip lives. Private; never a public URL. */
function reportObjectKey(clinicId: string, id: string, mimeType: string): string {
  const extension = mimeType.split('/')[1]?.replace('x-', '') ?? 'bin'
  return `reports/${clinicId}/${id}.${extension}`
}

export interface RecordedUpload {
  readonly uploadId: string
  readonly objectKey: string
}

/**
 * Accept a photographed report.
 *
 * The bytes go to storage first, then the row. That is the opposite order from
 * a voice note, and deliberately: a voice note's row is the message itself and
 * must survive a storage failure so somebody sees an unanswered question. A
 * report row with no image behind it is the reverse — it would enter the
 * extraction queue, fail to read a file that does not exist, and appear on the
 * consultation screen as a slip the model could not make out. Nothing is lost
 * by failing the upload outright and asking for the photograph again.
 *
 * The hash is computed from the bytes actually received, not from anything the
 * client said, and it is what later proves the stored image was never altered.
 */
export async function uploadReport(
  actor: ActorContext,
  image: Uint8Array,
  input: unknown,
): Promise<RecordedUpload> {
  requirePermission(actor, 'upload.create')

  const parsed = UploadReportSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This report could not be accepted.', parsed.error.issues)
  }

  const data = parsed.data

  if (image.byteLength !== data.byteSize) {
    throw validation('The uploaded image did not match its stated size.')
  }

  const id = randomUUID()
  const key = reportObjectKey(actor.clinicId, id, data.mimeType)

  await putObject(key, image, data.mimeType)

  const uploadId = await repo.recordUpload(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId: data.patientId,
    // Only ever what the caller established. An upload with no pregnancy waits
    // in the inbox rather than being attached to a likely-looking episode.
    pregnancyId: data.pregnancyId ?? null,
    visitId: data.visitId ?? null,
    objectKey: key,
    contentType: data.mimeType,
    byteSize: data.byteSize,
    sha256Hex: createHash('sha256').update(image).digest('hex'),
  })

  return { uploadId, objectKey: key }
}

/**
 * Every document on one pregnancy, with what extraction made of it.
 *
 * Three reads rather than one join: PostgREST cannot express "the newest run
 * per upload", and doing it in SQL would need a view whose only consumer is
 * this function. The three are small and bounded by one pregnancy's documents.
 */
export async function listReports(
  actor: ActorContext,
  pregnancyId: string,
): Promise<ReportWithExtraction[]> {
  requirePermission(actor, 'upload.read')

  const db = await userClient()
  const uploads = await repo.listUploadsForPregnancy(db, actor.clinicId, pregnancyId)
  if (uploads.length === 0) return []

  const ids = uploads.map((upload) => upload.id)

  const [runs, reviews] = await Promise.all([
    repo.loadLatestRuns(db, actor.clinicId, ids),
    repo.findReviewTimes(db, actor.clinicId, ids),
  ])

  return uploads.map((upload) => {
    const entry = runs.get(upload.id)

    return {
      upload: toReportUpload(upload),
      extraction: toExtractionState(entry?.run ?? null, entry?.candidates ?? []),
      reviewedAt: reviews.get(upload.id) ?? null,
    }
  })
}

/**
 * What the consultation screen offers for verification.
 *
 * Narrowed to reports that are read and unreviewed, because those are the only
 * ones a clinician can act on. A slip still in the queue, one that failed, and
 * one verified at an earlier visit are all excluded — the first two because
 * there is nothing to approve, the third because re-offering it invites a
 * result being entered into the record twice.
 */
export async function listAwaitingVerification(
  actor: ActorContext,
  pregnancyId: string,
): Promise<ReportWithExtraction[]> {
  const reports = await listReports(actor, pregnancyId)

  return reports.filter(
    (report) =>
      report.reviewedAt === null &&
      report.extraction.status === 'READY' &&
      report.extraction.candidates.length > 0,
  )
}

/** Documents nobody has attached to an episode yet. */
export async function listInbox(
  actor: ActorContext,
  limit = 50,
): Promise<ReportWithExtraction[]> {
  requirePermission(actor, 'upload.read')

  const db = await userClient()
  const uploads = await repo.listInbox(db, actor.clinicId, limit)
  if (uploads.length === 0) return []

  const runs = await repo.loadLatestRuns(db, actor.clinicId, uploads.map((u) => u.id))

  return uploads.map((upload) => {
    const entry = runs.get(upload.id)

    return {
      upload: toReportUpload(upload),
      extraction: toExtractionState(entry?.run ?? null, entry?.candidates ?? []),
      // An unassigned upload has never been reviewed; there is nothing to
      // review it against until somebody says whose it is.
      reviewedAt: null,
    }
  })
}

/**
 * A short-lived link to the original photograph.
 *
 * The point of the whole pipeline is that a clinician can check an extracted
 * number against the slip it was read from. The link expires in minutes — an
 * object key is not a secret, and a lasting URL to a lab report is an
 * unauthenticated leak of a patient's results.
 */
export async function openUpload(actor: ActorContext, uploadId: string): Promise<string> {
  requirePermission(actor, 'upload.read')

  // Read as the signed-in user, so RLS decides whether this upload is theirs to
  // open before the service role is used to mint anything.
  const upload = await repo.findUploadById(await userClient(), actor.clinicId, uploadId)
  if (!upload) {
    throw validation('That report is not recorded at this clinic.')
  }

  return signedUrl(upload.objectKey)
}

/**
 * Staff fixing what the model misread.
 *
 * Transcription, not verification. Held by assistants because the person
 * holding the slip is the person who can read it, and withheld from nobody's
 * record: the corrected value is still a candidate afterwards.
 */
export async function correctCandidate(
  actor: ActorContext,
  candidateId: string,
  input: unknown,
): Promise<number> {
  requirePermission(actor, 'upload.correct_candidates')

  const parsed = CorrectCandidateSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('That correction could not be accepted.', parsed.error.issues)
  }

  const data = parsed.data

  return repo.correctCandidate(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    candidateId,
    valueNumeric: data.valueNumeric ?? null,
    valueText: data.valueText ?? null,
    unit: data.unit ?? null,
    observedDate: data.observedDate ?? null,
    discard: data.discard,
  })
}

/**
 * Attach an inbox slip to an episode, or quarantine a wrong-patient one.
 *
 * Reassignment is deliberately a higher permission than upload: moving a report
 * from one mother to another is the event a record must be able to show in
 * full, and the routine audits the previous association for exactly that.
 */
export async function assignUpload(
  actor: ActorContext,
  uploadId: string,
  input: unknown,
): Promise<void> {
  requirePermission(actor, 'upload.reassign')

  const parsed = AssignUploadSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('That report could not be attached.', parsed.error.issues)
  }

  await repo.assignUpload(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    uploadId,
    pregnancyId: parsed.data.pregnancyId ?? null,
    quarantineReason: parsed.data.quarantineReason ?? null,
  })
}

/* -------------------------------------------------------------------------- */
/* Worker                                                                     */
/* -------------------------------------------------------------------------- */

/** Uploads no model has looked at yet, oldest first. */
export async function listQueuedExtractions(limit: number): Promise<string[]> {
  const uploads = await repo.listAwaitingExtraction(serviceClient(), limit)
  return uploads.map((upload) => upload.id)
}

/**
 * Read one queued upload, and record what the model said.
 *
 * Called by the worker, which holds no session and therefore no `ActorContext`.
 * It may propose and it may record a failure. It cannot verify, and
 * `CLINICIAN_ONLY_PERMISSIONS` exists so that stays true as this grows (ARCH-8).
 *
 * A failure is recorded as a failure. There is no path here that turns an
 * unreadable photograph into an empty-but-successful reading, because a slip
 * shown as "no results found" is one a clinician stops looking for.
 */
export async function extractQueuedReport(
  uploadId: string,
): Promise<{ ok: boolean; detail: string }> {
  const db = serviceClient()

  const clinicId = await repo.findClinicIdForUpload(db, uploadId)
  if (!clinicId) return { ok: false, detail: 'Upload not found.' }

  const upload = await repo.findUploadById(db, clinicId, uploadId)
  if (!upload) return { ok: false, detail: 'Upload not found.' }

  const provider = ocrProvider()
  const worker = `ocr:${provider.name}`
  const requestId = `worker-${randomUUID()}`

  const runId = await repo.startExtractionRun(db, {
    clinicId,
    worker,
    requestId,
    uploadId,
    provider: provider.name,
    model: provider.model,
    promptVersion: provider.promptVersion,
  })

  // The run row exists before the image is read, so a crash mid-call leaves a
  // visible PROCESSING attempt rather than an upload that looks untouched and
  // gets picked up forever.
  let image: Uint8Array
  try {
    image = await getObject(upload.objectKey)
  } catch {
    await repo.failExtractionRun(db, {
      clinicId,
      worker,
      requestId,
      runId,
      errorCode: 'IMAGE_UNREADABLE',
      errorMessage: 'The stored photograph could not be read. Take it again.',
    })
    return { ok: false, detail: 'IMAGE_UNREADABLE' }
  }

  const result = await provider.extract({ image, mimeType: upload.contentType })

  if (!result.ok) {
    await repo.failExtractionRun(db, {
      clinicId,
      worker,
      requestId,
      runId,
      errorCode: result.code,
      errorMessage: result.message,
    })
    return { ok: false, detail: `${result.code}: ${result.message}` }
  }

  const { extraction } = result

  // A numeric field whose unit went missing is dropped rather than stored. The
  // column CHECK would refuse it and fail the whole run, losing every other
  // value on the slip; and a unitless number offered for verification is worse
  // than no reading at all (ARCH-9). The verbatim output is kept below, so the
  // dropped field is still recoverable.
  const usable = extraction.fields.filter(
    (field) => field.valueNumeric === null || field.unit !== null,
  )
  const dropped = extraction.fields.length - usable.length

  const candidates = usable.map((field) => ({
    testCode: field.testCode,
    printedLabel: field.printedLabel,
    valueNumeric: field.valueNumeric,
    valueText: field.valueText,
    unit: field.unit,
    referenceLow: field.referenceLow,
    referenceHigh: field.referenceHigh,
    referenceText: field.referenceText,
    // The slip's own date when it printed one. Nothing is invented here: a
    // candidate with no date is dated at verification and says so.
    observedDate: extraction.reportDate,
    confidence: field.confidence,
  }))

  const count = await repo.completeExtractionRun(db, {
    clinicId,
    worker,
    requestId,
    runId,
    rawOutput: {
      provider: extraction.provider,
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      reportDate: extraction.reportDate,
      droppedUnitlessFields: dropped,
      response: extraction.raw,
    },
    reportType: extraction.reportType,
    candidates,
  })

  return {
    ok: true,
    detail:
      `${count} candidate(s), ${extraction.reportType}` +
      (dropped > 0 ? `, ${dropped} dropped for a missing unit` : '') +
      (ocrIsFixture() ? ' (fixture)' : ''),
  }
}
