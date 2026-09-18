import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient, serviceClient } from '@core/db/clients'
import { AppError, notFound, validation } from '@core/errors/app-error'

import * as repo from './visit.repository'
import { CancelVisitSchema, OpenVisitSchema, RecordVitalsSchema } from './visit.schema'
import type { OpenedVisit, Visit, VisitWithVitals, VitalsReading } from './visit.types'

/**
 * The visits module's public API.
 *
 * Reads run as the signed-in user so RLS applies independently; writes run
 * through the service role, because the routines in migration 0016 are revoked
 * from `authenticated`.
 */

/* -------------------------------------------------------------------------- */
/* Open                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Start a consultation, or return the one already open.
 *
 * Deliberately not an error when a visit is already open. At eighty patients a
 * shift on hospital wifi, "start visit" gets double-clicked and requests get
 * retried after timeouts that actually succeeded. Both must land on the same
 * consultation — a second one would split this patient's vitals, orders and
 * review decisions across two records.
 *
 * `created` tells the caller which happened, so the UI can say "resuming" and
 * the counter is never interrupted by a conflict it cannot act on.
 */
export async function openVisit(actor: ActorContext, input: unknown): Promise<OpenedVisit> {
  requirePermission(actor, 'visit.open')

  const parsed = OpenVisitSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This visit could not be started.', parsed.error.issues)
  }

  const result = await repo.openOrReuseVisit(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId: parsed.data.pregnancyId,
    visitType: parsed.data.visitType,
  })

  const visit = await repo.findVisitById(await userClient(), actor.clinicId, result.visitId)
  if (!visit) {
    throw new AppError('INTERNAL', 'The visit was opened but could not be read back.')
  }

  return { visit, created: result.created }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function getVisit(actor: ActorContext, visitId: string): Promise<Visit> {
  requirePermission(actor, 'visit.read')

  const visit = await repo.findVisitById(await userClient(), actor.clinicId, visitId)
  if (!visit) throw notFound('That visit is not recorded at this clinic.')

  return visit
}

/**
 * A visit with every reading taken during it.
 *
 * All readings, not just the latest: a blood-pressure recheck after fifteen
 * minutes is the comparison the clinician performed it to make, and it is only
 * visible if both survive to the screen.
 */
export async function getVisitWithVitals(
  actor: ActorContext,
  visitId: string,
): Promise<VisitWithVitals> {
  requirePermission(actor, 'visit.read')

  const db = await userClient()
  const visit = await repo.findVisitById(db, actor.clinicId, visitId)
  if (!visit) throw notFound('That visit is not recorded at this clinic.')

  const vitals = await repo.listVitalsForVisit(db, actor.clinicId, visitId)
  return { visit, vitals }
}

/** The consultation currently open for a pregnancy, or null. */
export async function getOpenVisit(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Visit | null> {
  requirePermission(actor, 'visit.read')

  return repo.findOpenVisit(await userClient(), actor.clinicId, pregnancyId)
}

/** Visit history for a pregnancy, most recent first. Cancelled visits excluded. */
export async function listVisits(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Visit[]> {
  requirePermission(actor, 'visit.read')

  return repo.listVisitsForPregnancy(await userClient(), actor.clinicId, pregnancyId)
}

/* -------------------------------------------------------------------------- */
/* Vitals                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Record a set of observations.
 *
 * Appends a row. A recheck is the next reading, never an edit of the first —
 * overwriting would destroy the comparison the recheck exists to make.
 *
 * Held by nurses as well as doctors: in this workflow the nurse takes vitals
 * before the doctor ever sees the patient, and making that wait on a clinician
 * would put the bottleneck exactly where the product is trying to remove it.
 */
export async function recordVitals(
  actor: ActorContext,
  visitId: string,
  input: unknown,
): Promise<VitalsReading> {
  requirePermission(actor, 'visit.record_vitals')

  const parsed = RecordVitalsSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('These vitals could not be recorded.', parsed.error.issues)
  }

  const v = parsed.data

  const vitalsId = await repo.recordVitals(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    visitId,
    // The nested pair is flattened here, at the boundary with the database. The
    // domain keeps them together so a lone diastolic is unrepresentable.
    bpSystolicMmHg: v.bloodPressure?.systolicMmHg ?? null,
    bpDiastolicMmHg: v.bloodPressure?.diastolicMmHg ?? null,
    pulseBpm: v.pulseBpm ?? null,
    respiratoryRateBpm: v.respiratoryRateBpm ?? null,
    temperatureC: v.temperatureC ?? null,
    spo2Percent: v.spo2Percent ?? null,
    weightKg: v.weightKg ?? null,
    fundalHeightCm: v.fundalHeightCm ?? null,
    fetalHeartRateBpm: v.fetalHeartRateBpm ?? null,
    urineAlbumin: v.urineAlbumin ?? null,
    urineSugar: v.urineSugar ?? null,
    note: v.note ?? null,
  })

  const readings = await repo.listVitalsForVisit(await userClient(), actor.clinicId, visitId)
  const recorded = readings.find((r) => r.id === vitalsId)
  if (!recorded) {
    throw new AppError('INTERNAL', 'The vitals were recorded but could not be read back.')
  }

  return recorded
}

/* -------------------------------------------------------------------------- */
/* Cancel                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Cancel a visit opened in error.
 *
 * For the wrong file scanned, or a duplicate started at a second terminal.
 * Only an open visit can be cancelled: a saved consultation is a clinical
 * record, and undoing one is an attributed amendment against the original.
 */
export async function cancelVisit(
  actor: ActorContext,
  visitId: string,
  input: unknown,
): Promise<Visit> {
  requirePermission(actor, 'visit.cancel')

  const parsed = CancelVisitSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This visit could not be cancelled.', parsed.error.issues)
  }

  await repo.cancelVisit(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    visitId,
    expectedVersion: parsed.data.expectedVersion,
    reason: parsed.data.reason,
  })

  const visit = await repo.findVisitById(await userClient(), actor.clinicId, visitId)
  if (!visit) throw notFound('That visit is not recorded at this clinic.')

  return visit
}
