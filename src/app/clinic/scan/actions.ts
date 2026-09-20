'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { getPatientByQrToken } from '@modules/patients/patient.service'

/**
 * Resolve a scanned file sticker to a patient record.
 *
 * ---------------------------------------------------------------------------
 * Why this is a POST and never a link
 * ---------------------------------------------------------------------------
 * The obvious implementation is `/clinic/scan?token=…`, and it is wrong. A
 * token in a URL lands in browser history, in the referer header of anything
 * the next page loads, and in any proxy or server access log along the way — on
 * a shared OPD machine that is a working key to a patient's record left lying
 * around. A server action carries it in the request body instead, and the
 * browser is redirected to the patient's own URL afterwards.
 *
 * Every failure returns the same message. Unknown token, revoked sticker, a
 * token belonging to another clinic — telling them apart would turn the
 * scanner into an oracle for probing which codes are real.
 */

export interface ScanState {
  readonly error: string | null
}

export async function resolveScan(
  _previous: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { error: 'Your session has ended. Sign in again.' }
  }

  const raw = formData.get('token')
  const token = typeof raw === 'string' ? raw.trim() : ''

  if (token.length === 0) {
    return { error: 'Scan a sticker, or type the code printed under it.' }
  }

  let patientId: string
  try {
    const patient = await getPatientByQrToken(session.actor, token)
    patientId = patient.id
  } catch (error) {
    if (error instanceof AppError) {
      return { error: 'That sticker does not match a file at this clinic.' }
    }
    throw error
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // swallow the navigation and report a scan failure on a successful scan.
  redirect(`/clinic/patients/${patientId}` as Route)
}
