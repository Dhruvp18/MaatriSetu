'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { correctCandidate, uploadReport } from '@modules/reports/report.service'

/**
 * Getting a photographed slip into the system, and fixing what was misread.
 *
 * Neither of these puts anything into a patient's record. The upload is a
 * document; the correction is transcription. The only act that creates a
 * clinical fact is Save & Next, in the cockpit, by a clinician.
 *
 * Every rule — accepted formats, size, the unit that must accompany a number —
 * lives behind the service, so this file cannot disagree with what the server
 * will accept.
 */

export type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'done'; readonly message: string }
  | { readonly status: 'error'; readonly message: string }

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function submitUpload(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const patientId = text(formData, 'patientId')
  const file = formData.get('image')

  if (!patientId || !(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a photograph of the report first.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  try {
    await uploadReport(session.actor, bytes, {
      patientId,
      pregnancyId: text(formData, 'pregnancyId'),
      visitId: text(formData, 'visitId'),
      // The browser's own idea of the type, checked against the enum in the
      // schema. A file the camera roll labelled oddly fails here with a
      // sentence rather than reaching a provider that cannot read it.
      mimeType: file.type,
      byteSize: bytes.byteLength,
    })
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/reports`)

  return {
    status: 'done',
    // Deliberately not "extracted" or "added". The photograph is stored; what
    // it says is still nobody's claim.
    message: 'Report stored. It is queued for reading, and nothing from it enters her record until a doctor verifies it.',
  }
}

export type CorrectionState =
  | { readonly status: 'idle' }
  | { readonly status: 'done' }
  | { readonly status: 'error'; readonly message: string }

export async function submitCorrection(
  _previous: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const candidateId = text(formData, 'candidateId')
  const patientId = text(formData, 'patientId')

  if (!candidateId || !patientId) {
    return { status: 'error', message: 'That value could not be identified.' }
  }

  const discard = formData.get('discard') === 'true'
  const rawNumeric = text(formData, 'valueNumeric')

  // Parsed here rather than coerced by the schema so that "8.6O" — an O typed
  // for a zero, which is exactly the correction being made — is refused rather
  // than silently becoming 8.6.
  let valueNumeric: number | null = null
  if (rawNumeric !== null) {
    valueNumeric = Number(rawNumeric)
    if (!Number.isFinite(valueNumeric)) {
      return { status: 'error', message: `"${rawNumeric}" is not a number.` }
    }
  }

  try {
    // The value travels even when discarding. `correct_report_candidate`
    // assigns the columns rather than coalescing, so sending nulls here would
    // wipe the reading — and a discarded row with nothing in it cannot be
    // looked at later, which is the entire reason discarding is recorded
    // rather than being a delete.
    await correctCandidate(session.actor, candidateId, {
      valueNumeric,
      valueText: text(formData, 'valueText'),
      unit: text(formData, 'unit'),
      observedDate: text(formData, 'observedDate'),
      discard,
    })
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/reports`)

  return { status: 'done' }
}
