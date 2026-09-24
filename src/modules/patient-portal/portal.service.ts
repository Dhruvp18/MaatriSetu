import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { putObject } from '@core/storage/clinical-media'

// ARCH-4 exception, deliberate and confined to this file. The other modules'
// services authorize a *staff* actor and would refuse a patient outright. The
// portal's authorization is different in kind — "is this her own record" —
// and it is enforced here, by scoping every call to `self.patientId`, which
// comes from a signed session and never from the browser.
import * as patientRepo from '@/modules/patients/patient.repository'
import * as pregnancyRepo from '@/modules/pregnancies/pregnancy.repository'
import * as orderRepo from '@/modules/orders/order.repository'
import * as reportRepo from '@/modules/reports/report.repository'
import * as visitRepo from '@/modules/visits/visit.repository'
import { expectedDueDate, gestationalAgeOn } from '@/modules/pregnancies/pregnancy.types'

import * as repo from './portal.repository'
import {
  PatientQueryTextSchema,
  PortalUploadSchema,
  QrResolveSchema,
} from './portal.schema'
import type {
  ClinicPatientQuery,
  PatientDashboard,
  PatientQuery,
  PatientSelf,
  TriageLevel,
} from './portal.types'

/**
 * The patient portal's public API: a mother reading and adding to her own
 * record from her phone.
 *
 * Runs as the service role because there is no Supabase session on this side —
 * the QR sticker is the credential. That makes the scoping below the entire
 * access control, so every function takes a `PatientSelf` and nothing else
 * that names a patient.
 */

/** Clinics are Indian; a patient's "today" is the clinic's. */
const PORTAL_TIMEZONE = 'Asia/Kolkata'

/* -------------------------------------------------------------------------- */
/* Sign-in                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The patient a scanned sticker belongs to, or null.
 *
 * Null for a malformed, unknown, revoked or other-clinic token alike, so a
 * scanned value cannot be used to learn which it was.
 */
export async function resolveQr(input: unknown): Promise<PatientSelf | null> {
  const parsed = QrResolveSchema.safeParse(input)
  if (!parsed.success) return null

  const { clinicId, token } = parsed.data
  const patientId = await patientRepo.findPatientIdByQrHash(serviceClient(), {
    clinicId,
    // Null: the patient is acting, audited as `patient-portal` (0027).
    actorStaffUserId: null,
    requestId: randomUUID(),
    tokenHashHex: createHash('sha256').update(token).digest('hex'),
  })

  return patientId ? { patientId, clinicId } : null
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function getDashboard(self: PatientSelf): Promise<PatientDashboard> {
  const db = serviceClient()
  const [patient, pregnancy] = await Promise.all([
    patientRepo.findPatientById(db, self.clinicId, self.patientId),
    pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId),
  ])

  const empty: PatientDashboard = {
    fullName: patient?.fullName ?? 'Patient',
    uhid: patient?.uhid ?? '',
    gestationalAge: null,
    edd: null,
    trimester: null,
    lastVisitDate: null,
    nextFollowUpDate: null,
    hasActivePregnancy: false,
  }
  if (!patient || !pregnancy) return empty

  const ga = gestationalAgeOn(pregnancy.dating, todayIn(PORTAL_TIMEZONE))

  const visits = await visitRepo.listVisitsForPregnancy(db, self.clinicId, pregnancy.id)
  const lastSaved = visits.find((v) => v.status === 'SAVED') ?? null
  const advice = lastSaved ? await visitRepo.findAdviceForVisit(db, self.clinicId, lastSaved.id) : null

  let trimester: 1 | 2 | 3 | null = null
  if (ga) trimester = ga.totalDays < 98 ? 1 : ga.totalDays < 196 ? 2 : 3

  return {
    ...empty,
    gestationalAge: ga ? { weeks: ga.weeks, days: ga.days } : null,
    edd: expectedDueDate(pregnancy.dating),
    trimester,
    lastVisitDate: lastSaved ? lastSaved.occurredAt.slice(0, 10) : null,
    nextFollowUpDate: advice?.nextFollowupDate ?? null,
    hasActivePregnancy: true,
  }
}

export async function getProfile(self: PatientSelf) {
  const db = serviceClient()
  const [patient, obstetricHistory] = await Promise.all([
    patientRepo.findPatientById(db, self.clinicId, self.patientId),
    pregnancyRepo.listObstetricHistory(db, self.clinicId, self.patientId),
  ])
  return { patient, obstetricHistory }
}

export async function getPrescriptions(self: PatientSelf) {
  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)
  if (!pregnancy) return { hasActivePregnancy: false as const, prescriptions: [] }

  const prescriptions = await orderRepo.listPrescriptions(db, self.clinicId, pregnancy.id)
  return { hasActivePregnancy: true as const, prescriptions }
}

export async function getReports(self: PatientSelf) {
  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)
  if (!pregnancy) return { hasActivePregnancy: false as const, observations: [], scans: [] }

  // Pins are a clinician's display preference; the patient sees everything.
  const noPins = new Set<string>()
  const [observations, scans] = await Promise.all([
    reportRepo.listObservations(db, self.clinicId, pregnancy.id, noPins),
    reportRepo.listScans(db, self.clinicId, pregnancy.id, noPins),
  ])
  return { hasActivePregnancy: true as const, observations, scans }
}

export async function getChatHistory(self: PatientSelf): Promise<PatientQuery[]> {
  return repo.listQueriesForPatient(serviceClient(), self.clinicId, self.patientId, 50)
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** Logs a chatbot exchange so the clinic can review it. */
export async function recordQuestion(
  self: PatientSelf,
  input: { queryText: unknown; botResponse: string; triageLevel: TriageLevel },
): Promise<void> {
  const queryText = PatientQueryTextSchema.safeParse(input.queryText)
  if (!queryText.success) throw validation('That question could not be understood.', queryText.error.issues)

  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)

  await repo.insertPatientQuery(db, {
    clinicId: self.clinicId,
    patientId: self.patientId,
    pregnancyId: pregnancy?.id ?? null,
    queryText: queryText.data,
    botResponse: input.botResponse,
    triageLevel: input.triageLevel,
  })
}

/**
 * A photograph of her own report. Lands ASSIGNED to her active pregnancy and
 * queued for extraction like any staff upload; nothing is clinical until a
 * doctor verifies it.
 */
export async function uploadOwnReport(
  self: PatientSelf,
  file: { bytes: Uint8Array; contentType: string },
): Promise<string> {
  const parsed = PortalUploadSchema.safeParse({
    contentType: file.contentType,
    byteSize: file.bytes.length,
  })
  if (!parsed.success) throw validation('That file cannot be uploaded.', parsed.error.issues)

  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)
  if (!pregnancy) throw validation('There is no active pregnancy to attach this report to.')

  const extension = parsed.data.contentType.split('/')[1]
  const objectKey = `reports/${self.clinicId}/${randomUUID()}.${extension}`

  await putObject(objectKey, file.bytes, parsed.data.contentType)

  return reportRepo.recordUpload(db, {
    clinicId: self.clinicId,
    actorStaffUserId: null,
    requestId: randomUUID(),
    patientId: self.patientId,
    pregnancyId: pregnancy.id,
    visitId: null,
    objectKey,
    contentType: parsed.data.contentType,
    byteSize: parsed.data.byteSize,
    sha256Hex: createHash('sha256').update(file.bytes).digest('hex'),
  })
}

/* -------------------------------------------------------------------------- */
/* Clinic side                                                                */
/* -------------------------------------------------------------------------- */

/** Unreviewed patient questions for the clinic home screen, most severe first. */
export async function listUnreviewedQueries(actor: ActorContext): Promise<ClinicPatientQuery[]> {
  requirePermission(actor, 'query.read')
  // As the signed-in user: RLS (0026) is the second, independent check.
  return repo.listUnreviewedQueries(await userClient(), actor.clinicId, 20)
}
