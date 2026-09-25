import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient, type TypedClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { putObject } from '@core/storage/clinical-media'
import { hashPassword, verifyPassword } from '@core/auth/password-hash'

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
import * as diagnosisRepo from '@/modules/diagnoses/diagnosis.repository'
import * as monitoringRepo from '@/modules/monitoring/monitoring.repository'
import { expectedDueDate, gestationalAgeOn } from '@/modules/pregnancies/pregnancy.types'
import { metricsForDiagnoses, type MonitoringMetricPanel } from '@/modules/monitoring/monitoring.types'
import { RecordHomeReadingSchema } from '@/modules/monitoring/monitoring.schema'

import * as repo from './portal.repository'
import * as credentialsRepo from './credentials.repository'
import {
  PatientLoginSchema,
  PatientQueryTextSchema,
  PortalUploadSchema,
  QrResolveSchema,
} from './portal.schema'
import {
  SEEDED_CLINIC_ID,
  type ClinicPatientQuery,
  type PatientDashboard,
  type PatientQuery,
  type PatientSelf,
  type TriageLevel,
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

/**
 * UHID and password login for `/patient/login`.
 *
 * The form has no clinic selector, so this checks the one clinic the demo
 * deployment seeds (`SEEDED_CLINIC_ID`) — same scope `PATIENT_DEMO_SESSION`
 * already uses for its fixture patient. Her UHID is not secret (it is printed
 * on her card); the password is what actually authenticates her, exactly as
 * an account number and a PIN do at a bank.
 *
 * Returns null for an unknown UHID, a patient with no password ever set, and
 * a wrong password alike — distinguishing them would tell a guesser which
 * UHIDs are real.
 */
export async function loginWithPassword(input: unknown): Promise<PatientSelf | null> {
  const parsed = PatientLoginSchema.safeParse(input)
  if (!parsed.success) return null

  const db = serviceClient()
  const patientId = await patientRepo.findPatientIdByUhid(db, SEEDED_CLINIC_ID, parsed.data.uhid)
  if (!patientId) return null

  const storedHash = await credentialsRepo.findPasswordHash(db, SEEDED_CLINIC_ID, patientId)
  if (!storedHash) return null

  return verifyPassword(parsed.data.password, storedHash) ? { patientId, clinicId: SEEDED_CLINIC_ID } : null
}

/**
 * Sets (or replaces) her portal password.
 *
 * Not reached from the browser today — there is no self-service signup or
 * clinic-side "issue portal access" screen yet, so this exists for seeding
 * and for whatever provisions credentials next. Kept here rather than inline
 * in a seed script because hashing a password incorrectly is exactly the kind
 * of mistake that belongs behind one tested function, not copied into every
 * caller.
 */
export async function setPortalPassword(patientId: string, password: string): Promise<void> {
  await credentialsRepo.upsertPassword(serviceClient(), {
    clinicId: SEEDED_CLINIC_ID,
    patientId,
    passwordHash: hashPassword(password),
  })
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

/**
 * Every diagnosis on record for a pregnancy, from wherever a clinician wrote
 * one down — no separate "flag it" step required.
 *
 * Two sources, because this clinic has two places a diagnosis is normally
 * written: the flagged-diagnosis banner (modules/diagnoses), and the
 * `diagnosis` a clinician types when saving an ordinary consultation
 * (modules/visits). A mother whose doctor only ever used the second one is
 * exactly as "diagnosed" as one whose doctor used the first — home monitoring
 * has to switch on for both, automatically, the moment either exists.
 */
async function diagnosisLabelsForPregnancy(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<string[]> {
  const [flags, visits] = await Promise.all([
    diagnosisRepo.listOpen(db, clinicId, pregnancyId),
    visitRepo.listVisitsForPregnancy(db, clinicId, pregnancyId),
  ])

  const visitDiagnoses = visits
    .filter((v) => v.status === 'SAVED' && v.diagnosis !== null && v.diagnosis.trim() !== '')
    .map((v) => v.diagnosis as string)

  return [...flags.map((f) => f.label), ...visitDiagnoses]
}

/**
 * Which home-monitoring metrics apply to her, and her logged history for each.
 *
 * "Applies to her" is read off diagnoses a clinician has already written down
 * somewhere on her active pregnancy — never decided by this function. A
 * patient with no matching diagnosis gets an empty panel list, which the
 * dashboard renders as no monitoring tile at all rather than an empty chart.
 */
export async function getMonitoring(
  self: PatientSelf,
): Promise<{ hasActivePregnancy: boolean; panels: readonly MonitoringMetricPanel[] }> {
  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)
  if (!pregnancy) return { hasActivePregnancy: false, panels: [] }

  const labels = await diagnosisLabelsForPregnancy(db, self.clinicId, pregnancy.id)
  const metrics = metricsForDiagnoses(labels)

  const panels = await Promise.all(
    metrics.map(async (metric) => ({
      metric,
      readings: await monitoringRepo.listReadings(db, {
        clinicId: self.clinicId,
        patientId: self.patientId,
        pregnancyId: pregnancy.id,
        metric,
      }),
    })),
  )

  return { hasActivePregnancy: true, panels }
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

/**
 * Logs one self-monitoring reading against her active pregnancy.
 *
 * The metric must be one her own flagged diagnoses actually call for — this
 * is re-checked here, server-side, rather than trusted from whatever tile the
 * browser happened to show, because the browser's tile list is not itself an
 * authorization decision.
 */
export async function recordHomeReading(self: PatientSelf, input: unknown): Promise<void> {
  const parsed = RecordHomeReadingSchema.safeParse(input)
  if (!parsed.success) throw validation('That reading could not be understood.', parsed.error.issues)

  const db = serviceClient()
  const pregnancy = await pregnancyRepo.findActivePregnancy(db, self.clinicId, self.patientId)
  if (!pregnancy) throw validation('There is no active pregnancy to log this reading against.')

  const labels = await diagnosisLabelsForPregnancy(db, self.clinicId, pregnancy.id)
  const allowed = metricsForDiagnoses(labels)
  if (!allowed.includes(parsed.data.metric)) {
    throw validation('This monitoring is not enabled for your record.')
  }

  await monitoringRepo.insertReading(db, {
    clinicId: self.clinicId,
    patientId: self.patientId,
    pregnancyId: pregnancy.id,
    input: parsed.data,
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
