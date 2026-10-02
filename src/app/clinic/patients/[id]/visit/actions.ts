'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { openVisit, recordVitals } from '@modules/visits/visit.service'

/**
 * Starting a visit, and recording a set of observations.
 *
 * Opening is a deliberate action rather than something the page does on load.
 * A visit is a clinical encounter with a timestamp and an author; creating one
 * because somebody opened a screen would put encounters on the record that
 * never happened.
 */

export interface VisitActionState {
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

export async function startVisit(
  _previous: VisitActionState,
  formData: FormData,
): Promise<VisitActionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { error: 'Your session has ended. Sign in again.' }

  const pregnancyId = text(formData, 'pregnancyId')
  const patientId = text(formData, 'patientId')
  if (!pregnancyId || !patientId) return { error: 'No pregnancy was specified.' }

  try {
    // Idempotent by design: a double-clicked button returns the visit that is
    // already open rather than creating a second encounter, so there is nothing
    // to report to the counter.
    await openVisit(session.actor, { pregnancyId, visitType: 'ANC_OPD' })
  } catch (error) {
    if (error instanceof AppError) return { error: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/visit`)
  return { error: null }
}

export async function submitVitals(
  _previous: VisitActionState,
  formData: FormData,
): Promise<VisitActionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { error: 'Your session has ended. Sign in again.' }

  const visitId = text(formData, 'visitId')
  const patientId = text(formData, 'patientId')
  if (!visitId || !patientId) return { error: 'No visit was specified.' }

  const systolic = num(formData, 'systolicMmHg')
  const diastolic = num(formData, 'diastolicMmHg')

  const input = {
    // Both halves or neither. The schema refuses a lone diastolic, and pairing
    // them here means the nurse gets that as a sentence rather than as a
    // constraint violation.
    bloodPressure:
      systolic !== null && diastolic !== null
        ? { systolicMmHg: systolic, diastolicMmHg: diastolic }
        : null,
    pulseBpm: num(formData, 'pulseBpm'),
    respiratoryRateBpm: num(formData, 'respiratoryRateBpm'),
    temperatureC: num(formData, 'temperatureC'),
    spo2Percent: num(formData, 'spo2Percent'),
    weightKg: num(formData, 'weightKg'),
    fundalHeightCm: num(formData, 'fundalHeightCm'),
    fetalHeartRateBpm: num(formData, 'fetalHeartRateBpm'),
    urineAlbumin: text(formData, 'urineAlbumin'),
    urineSugarMgDl: num(formData, 'urineSugarMgDl'),
    note: text(formData, 'note'),
  }

  try {
    await recordVitals(session.actor, visitId, input)
  } catch (error) {
    if (error instanceof AppError) {
      // Covers the empty-reading case too: a form submitted with nothing filled
      // in would otherwise write a timestamped row that reads as "vitals were
      // taken".
      return { error: error.message }
    }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/visit`)
  return { error: null }
}
