'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { instantFromClinicLocal } from '@core/time/clinic-time'
import { createDraft, issueReferral, updateDraft } from '@modules/referrals/referral.service'

/**
 * Starting, editing and issuing an emergency referral.
 *
 * Starting is a deliberate act, not something the page does on arrival: a
 * referral is a clinical document with an author, and creating one because
 * somebody opened a screen would put transfers on the record that never
 * happened.
 *
 * Every `datetime-local` field is converted here, at the boundary, using the
 * clinic's zone from the actor. The browser submits `2026-09-22T02:14` with no
 * offset, and letting the server or the database resolve that would record a
 * magnesium sulphate dose five and a half hours from when it was given.
 */

export interface ReferralActionState {
  readonly error: string | null
}

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const num = (form: FormData, key: string): number | null => {
  const raw = text(form, key)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

export async function startReferral(
  _previous: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { error: 'Your session has ended. Sign in again.' }

  const patientId = text(formData, 'patientId')
  const pregnancyId = text(formData, 'pregnancyId')
  if (!patientId || !pregnancyId) return { error: 'No pregnancy was specified.' }

  try {
    await createDraft(session.actor, {
      pregnancyId,
      // A referral raised inside a consultation records which one; one raised
      // at the bedside records none, and that is the common case.
      originVisitId: text(formData, 'originVisitId'),
      // Present when this referral corrects an issued one. The original stays
      // live until the replacement is actually issued.
      supersedesId: text(formData, 'supersedesId'),
      indication: text(formData, 'indication'),
      receivingFacility: text(formData, 'receivingFacility'),
    })
  } catch (error) {
    if (error instanceof AppError) return { error: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/referral`)
  return { error: null }
}

/* -------------------------------------------------------------------------- */
/* Save the draft                                                             */
/* -------------------------------------------------------------------------- */

export async function saveReferralDraft(
  _previous: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { error: 'Your session has ended. Sign in again.' }

  const { actor } = session
  const patientId = text(formData, 'patientId')
  const referralId = text(formData, 'referralId')
  const expectedVersion = num(formData, 'expectedVersion')

  if (!patientId || !referralId || expectedVersion === null) {
    return { error: 'No referral was specified.' }
  }

  const zone = actor.clinicTimezone

  const systolic = num(formData, 'systolicMmHg')
  const diastolic = num(formData, 'diastolicMmHg')

  const measurements = {
    // Both halves or neither. The schema refuses a lone diastolic, and pairing
    // them here means the clinician gets that as a sentence rather than as a
    // constraint violation.
    bloodPressure:
      systolic !== null && diastolic !== null
        ? { systolicMmHg: systolic, diastolicMmHg: diastolic }
        : null,
    pulseBpm: num(formData, 'pulseBpm'),
    respiratoryRateBpm: num(formData, 'respiratoryRateBpm'),
    spo2Percent: num(formData, 'spo2Percent'),
    temperatureC: num(formData, 'temperatureC'),
    urineAlbumin: text(formData, 'urineAlbumin'),
    fetalHeartRateBpm: num(formData, 'fetalHeartRateBpm'),
  }

  const anyMeasurement = Object.values(measurements).some((v) => v !== null)
  const vitalsRecordedAtLocal = text(formData, 'vitalsRecordedAt')

  // Checked here rather than left to zod so the message names the field. A
  // transfer BP with no time cannot be acted on by the receiving unit, and the
  // routine in 0021 refuses it too.
  if (anyMeasurement && !vitalsRecordedAtLocal) {
    return { error: 'Say when the transfer observations were taken.' }
  }

  const pv = {
    dilatationCm: num(formData, 'pvDilatationCm'),
    effacementPercent: num(formData, 'pvEffacementPercent'),
    station: text(formData, 'pvStation'),
    membranes: text(formData, 'pvMembranes') ?? 'NOT_ASSESSED',
    liquor: text(formData, 'pvLiquor'),
  }

  const anyPv =
    pv.dilatationCm !== null ||
    pv.effacementPercent !== null ||
    pv.station !== null ||
    pv.liquor !== null ||
    pv.membranes !== 'NOT_ASSESSED'

  const examinedAtLocal = text(formData, 'pvExaminedAt')

  if (anyPv && !examinedAtLocal) {
    return { error: 'Say when the vaginal examination was performed.' }
  }

  const departureAtLocal = text(formData, 'departureAt')

  try {
    await updateDraft(actor, referralId, {
      expectedVersion,
      referringFacility: text(formData, 'referringFacility'),
      referringDoctorName: text(formData, 'referringDoctorName'),
      referringContactPhone: text(formData, 'referringContactPhone'),
      receivingFacility: text(formData, 'receivingFacility'),
      receivingContact: text(formData, 'receivingContact'),
      transportMode: text(formData, 'transportMode'),
      departureAt: departureAtLocal ? instantFromClinicLocal(departureAtLocal, zone) : null,
      indication: text(formData, 'indication'),
      clinicalSummary: text(formData, 'clinicalSummary'),
      transferVitals:
        anyMeasurement && vitalsRecordedAtLocal
          ? { recordedAt: instantFromClinicLocal(vitalsRecordedAtLocal, zone), ...measurements }
          : null,
      examination:
        anyPv && examinedAtLocal
          ? { examinedAt: instantFromClinicLocal(examinedAtLocal, zone), ...pv }
          : null,
      linesAndCatheters: text(formData, 'linesAndCatheters'),
      accompanyingStaff: text(formData, 'accompanyingStaff'),
    })
  } catch (error) {
    // Covers the 409 from a stale version. The message tells the clinician to
    // refresh; nothing they typed is discarded on the way.
    if (error instanceof AppError) return { error: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/referral`)
  return { error: null }
}

/* -------------------------------------------------------------------------- */
/* Issue                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Freeze the document and go straight to it.
 *
 * The redirect is the point: the next thing anybody needs is the slip itself,
 * to print and to generate a link from. It happens outside the try block
 * because `redirect` signals by throwing, and catching it here would turn a
 * successful issue into an error message.
 */
export async function issueReferralAction(
  _previous: ReferralActionState,
  formData: FormData,
): Promise<ReferralActionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { error: 'Your session has ended. Sign in again.' }

  const patientId = text(formData, 'patientId')
  const referralId = text(formData, 'referralId')
  const expectedVersion = num(formData, 'expectedVersion')

  if (!patientId || !referralId || expectedVersion === null) {
    return { error: 'No referral was specified.' }
  }

  try {
    await issueReferral(session.actor, referralId, { expectedVersion })
  } catch (error) {
    if (error instanceof AppError) return { error: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/referral`)
  redirect(`/clinic/patients/${patientId}/referral/${referralId}`)
}
