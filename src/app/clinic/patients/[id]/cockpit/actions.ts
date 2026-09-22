'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { saveConsultation } from '@modules/visits/visit.service'

/**
 * Save & Next.
 *
 * Reshapes the form and hands it to the service. Every rule — dose units,
 * pin/unpin conflicts, the version check, idempotency — lives behind
 * `saveConsultation`, so this file cannot disagree with what the server will
 * accept.
 *
 * On success the clinician goes straight to the scanner. That is the actual
 * workflow: the consultation is finished, the next mother's file is already on
 * the desk, and returning to a screen about the patient who just left costs a
 * click at eighty patients a shift.
 */

export type SaveState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string; readonly retryable: boolean }

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const checked = (form: FormData, key: string): boolean => form.get(key) === 'on'

/** Split a comma-separated field into orders, dropping blanks. */
const list = (form: FormData, key: string): string[] =>
  (text(form, key) ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

export async function submitConsultation(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.', retryable: false }
  }

  const visitId = text(formData, 'visitId')
  const idempotencyKey = text(formData, 'idempotencyKey')
  const expectedVersion = Number(text(formData, 'expectedVersion') ?? Number.NaN)

  if (!visitId || !idempotencyKey || !Number.isInteger(expectedVersion)) {
    return { status: 'error', message: 'This consultation could not be identified.', retryable: false }
  }

  // Prescriptions are a dynamic list, so they travel as JSON from the client
  // rather than as indexed form fields. Parsed defensively: the service
  // validates the contents, but a malformed string should read as a form error
  // rather than a crash.
  let prescriptions: unknown = []
  const raw = text(formData, 'prescriptions')
  if (raw) {
    try {
      prescriptions = JSON.parse(raw)
    } catch {
      return { status: 'error', message: 'The prescription list could not be read.', retryable: false }
    }
  }

  // Checkbox groups arrive as repeated values.
  const pinObservationIds = formData.getAll('pin').filter((v): v is string => typeof v === 'string')
  const unpinObservationIds = formData
    .getAll('unpin')
    .filter((v): v is string => typeof v === 'string')

  const input = {
    expectedVersion,
    impression: text(formData, 'impression'),
    prescriptions,
    advice: {
      dfkcCounselled: checked(formData, 'dfkcCounselled'),
      nutritionCounselled: checked(formData, 'nutritionCounselled'),
      leftLateralRest: checked(formData, 'leftLateralRest'),
      dangerSignsCounselled: checked(formData, 'dangerSignsCounselled'),
      labOrders: list(formData, 'labOrders'),
      scanOrders: list(formData, 'scanOrders'),
      nextFollowupDate: text(formData, 'nextFollowupDate'),
      additionalAdvice: text(formData, 'additionalAdvice'),
    },
    pinObservationIds,
    unpinObservationIds,
    resolveQueryIds: formData
      .getAll('resolveQuery')
      .filter((v): v is string => typeof v === 'string'),
  }

  try {
    await saveConsultation(session.actor, visitId, idempotencyKey, input)
  } catch (error) {
    if (error instanceof AppError) {
      // A conflict means the visit moved under the editor, or an identical save
      // is already in flight. Either way the draft on screen is preserved — the
      // clinician refreshes and reconciles rather than losing what they typed.
      return { status: 'error', message: error.message, retryable: error.kind === 'CONFLICT' }
    }
    throw error
  }

  redirect('/clinic/scan' as Route)
}
