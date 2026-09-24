import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient, serviceClient } from '@core/db/clients'
import { hashPayload } from '@core/idempotency/request-key'
import { todayIn } from '@core/obstetrics/dating'
import { AppError, notFound, validation } from '@core/errors/app-error'

import * as repo from './visit.repository'
import {
  CancelVisitSchema,
  OpenVisitSchema,
  RecordVitalsSchema,
  SaveConsultationSchema,
} from './visit.schema'
import type {
  ClinicDoctor,
  DoctorReference,
  OpenedVisit,
  Visit,
  VisitAdvice,
  VisitWithVitals,
  VitalsReading,
} from './visit.types'

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

/**
 * What was advised at a visit, or null when nothing was recorded.
 *
 * Guarded by `visit.read` rather than by `advice.write`: writing advice is a
 * clinician act, but the nurse who prints the mother's card has to be able to
 * read back what she is printing.
 */
export async function getVisitAdvice(
  actor: ActorContext,
  visitId: string,
): Promise<VisitAdvice | null> {
  requirePermission(actor, 'visit.read')

  return repo.findAdviceForVisit(await userClient(), actor.clinicId, visitId)
}

/** Visit history for a pregnancy, most recent first. Cancelled visits excluded. */
export async function listVisits(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Visit[]> {
  requirePermission(actor, 'visit.read')

  return repo.listVisitsForPregnancy(await userClient(), actor.clinicId, pregnancyId)
}

/**
 * Doctors at this clinic, for naming the recipient of a reference.
 *
 * Guarded by `visit.save`: only the clinician finishing a consultation makes a
 * reference, and a staff directory is not something to hand every role.
 */
export async function listClinicDoctors(actor: ActorContext): Promise<ClinicDoctor[]> {
  requirePermission(actor, 'visit.save')

  const doctors = await repo.listClinicDoctors(await userClient(), actor.clinicId)
  // Referring a patient to yourself is not a reference.
  return doctors.filter((doctor) => doctor.staffUserId !== actor.staffUserId)
}

/** References to other doctors made during this pregnancy, newest first. */
export async function listDoctorReferences(
  actor: ActorContext,
  pregnancyId: string,
): Promise<DoctorReference[]> {
  requirePermission(actor, 'visit.read')

  return repo.listDoctorReferences(await userClient(), actor.clinicId, pregnancyId)
}

/**
 * The first weight recorded in this pregnancy, or null.
 *
 * The baseline the cockpit shows gain against when no pre-pregnancy weight was
 * taken at booking. Arithmetic on her own readings, never a judgment about
 * whether the gain is appropriate.
 */
export async function getFirstRecordedWeightKg(
  actor: ActorContext,
  pregnancyId: string,
): Promise<number | null> {
  requirePermission(actor, 'visit.read')

  return repo.findFirstWeightKg(await userClient(), actor.clinicId, pregnancyId)
}

/** Every vitals reading taken across the given visits, for trend lines. */
export async function listVitalsForVisits(
  actor: ActorContext,
  visitIds: readonly string[],
): Promise<{ visitId: string; reading: VitalsReading }[]> {
  requirePermission(actor, 'visit.read')
  if (visitIds.length === 0) return []

  return repo.listVitalsForVisits(await userClient(), actor.clinicId, visitIds)
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

/* -------------------------------------------------------------------------- */
/* Save & Next                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Commit the consultation.
 *
 * Reserved to doctors. A nurse records vitals and a nurse opens the visit, but
 * finishing a consultation — the impression, the orders, what gets surfaced on
 * the record — is a clinician act, and `visit.save` sits only with DOCTOR in
 * the matrix.
 *
 * The write goes through the service role because the routine in migration 0018
 * is revoked from `authenticated` and because the commit spans seven tables.
 * Authorization has already happened here (ARCH-5); there is no safety net
 * behind that client.
 *
 * `idempotencyKey` is minted by the caller when editing begins and travels with
 * every retry of that same save. Supplying a fresh key per attempt would defeat
 * the whole mechanism, so it is required rather than defaulted.
 */
export async function saveConsultation(
  actor: ActorContext,
  visitId: string,
  idempotencyKey: string,
  input: unknown,
): Promise<repo.SaveConsultationResult> {
  requirePermission(actor, 'visit.save')

  const parsed = SaveConsultationSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This consultation could not be saved.', parsed.error.issues)
  }

  const data = parsed.data

  // Fingerprinted from the PARSED payload, not the raw request. Two clients
  // that serialise the same consultation differently then agree, while a
  // genuinely different save still differs.
  const payloadHashHex = hashPayload({ visitId, ...data })

  return repo.saveConsultation(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    visitId,
    expectedVersion: data.expectedVersion,
    // The clinic's calendar day. Gestational age is frozen from it, and the
    // server's UTC clock is the wrong one for several hours each night in IST.
    asOfDate: todayIn(actor.clinicTimezone),
    impression: data.impression ?? null,
    examination: data.examination ?? null,
    diagnosis: data.diagnosis ?? null,
    summary: data.summary ?? null,
    reference: data.reference ?? null,
    extras: {
      chiefComplaints: data.chiefComplaints.map((c) => ({
        complaint: c.complaint,
        durationValue: c.durationValue ?? null,
        durationUnit: c.durationUnit ?? null,
      })),
      perAbdomen: data.perAbdomen ?? null,
      perVaginum: data.perVaginum ?? null,
      perSpeculum: data.perSpeculum ?? null,
      husbandBloodGroupCandidateIds: [...data.husbandBloodGroupCandidateIds],
    },
    prescriptions: data.prescriptions,
    advice: data.advice ?? null,
    // Verification lives in this commit and nowhere else: a standalone verify
    // endpoint would write observations that survive a failed save.
    verifyCandidates: data.verifyCandidates,
    pinObservationIds: [...data.pinObservationIds],
    unpinObservationIds: [...data.unpinObservationIds],
    resolveQueryIds: [...data.resolveQueryIds],
    idempotencyKey,
    payloadHashHex,
  })
}
