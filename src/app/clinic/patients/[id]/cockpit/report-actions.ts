'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { extractQueuedReport, openUpload, uploadReport } from '@modules/reports/report.service'

/**
 * Reports from inside the cockpit: bringing her existing slips and scans in,
 * and opening the original of any one of them.
 *
 * Uploading does not put anything in her record. Each file is stored, then
 * read, and what was read waits in the Diagnostic Reports panel for the doctor
 * to flag or mark reviewed — the only step that makes it part of her history.
 */

export type UploadResult =
  | { readonly ok: true; readonly stored: number; readonly failed: readonly string[] }
  | { readonly ok: false; readonly message: string }

export async function uploadReportsAction(formData: FormData): Promise<UploadResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { ok: false, message: 'Your session has ended. Sign in again.' }

  const patientId = formData.get('patientId')
  const pregnancyId = formData.get('pregnancyId')
  const visitId = formData.get('visitId')
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

  if (typeof patientId !== 'string' || !patientId) return { ok: false, message: 'No patient was specified.' }
  if (files.length === 0) return { ok: false, message: 'Choose at least one photograph or PDF.' }

  const stored: string[] = []
  const failed: string[] = []

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const { uploadId } = await uploadReport(session.actor, bytes, {
        patientId,
        pregnancyId: typeof pregnancyId === 'string' && pregnancyId ? pregnancyId : null,
        visitId: typeof visitId === 'string' && visitId ? visitId : null,
        mimeType: file.type,
        byteSize: bytes.byteLength,
      })
      stored.push(uploadId)
    } catch (error) {
      if (error instanceof AppError) failed.push(`${file.name}: ${error.message}`)
      else throw error
    }
  }

  // Read straight away, after the response is sent, so the doctor sees the
  // values within seconds instead of waiting for the worker's next poll. The
  // worker still picks up anything this misses, so a failure here costs only
  // time.
  if (stored.length > 0) {
    after(async () => {
      for (const uploadId of stored) {
        try {
          await extractQueuedReport(uploadId)
        } catch (error) {
          console.error('[cockpit] immediate extraction failed; the worker will retry', uploadId, error)
        }
      }
      revalidatePath(`/clinic/patients/${patientId}/cockpit`)
    })
  }

  revalidatePath(`/clinic/patients/${patientId}/cockpit`)
  return { ok: true, stored: stored.length, failed }
}

export type OriginalResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly message: string }

/** A link to the original photograph or PDF, valid for a few minutes. */
export async function openOriginalAction(uploadId: string): Promise<OriginalResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { ok: false, message: 'Your session has ended. Sign in again.' }

  try {
    return { ok: true, url: await openUpload(session.actor, uploadId) }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message }
    throw error
  }
}

export async function annotateObservationAction(observationId: string, patientId: string, formData: FormData) {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { ok: false, message: 'Your session has ended. Sign in again.' }

  const { userClient } = await import('@core/db/clients')
  const db = await userClient()

  const { error } = await db
    .from('observations')
    .update({ clinician_note: 'Does not require treatment' })
    .eq('clinic_id', session.actor.clinicId)
    .eq('id', observationId)

  if (error) {
    return { ok: false, message: error.message }
  }

  revalidatePath(`/clinic/patients/${patientId}/cockpit`)
}
