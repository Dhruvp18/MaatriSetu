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

  // Prescriptions and verifications are dynamic lists, so they travel as JSON
  // from the client rather than as indexed form fields. Parsed defensively: the
  // service validates the contents, but a malformed string should read as a
  // form error rather than a crash.
  const parseList = (key: string): unknown[] | null => {
    const raw = text(formData, key)
    if (!raw) return []
    try {
      return JSON.parse(raw) as unknown[]
    } catch {
      return null
    }
  }

  const prescriptions = parseList('prescriptions')
  if (prescriptions === null) {
    return { status: 'error', message: 'The prescription list could not be read.', retryable: false }
  }

  // The values the clinician ticked. This is the only route by which an
  // extracted reading becomes part of a patient's record, and it commits in the
  // same transaction as everything else on this form.
  const verifyCandidates = parseList('verifyCandidates')
  if (verifyCandidates === null) {
    return {
      status: 'error',
      message: 'The list of results you verified could not be read. Nothing was saved.',
      retryable: false,
    }
  }

  const chiefComplaints = parseList('chiefComplaints')
  const husbandBloodGroupCandidateIds = parseList('husbandBloodGroupCandidateIds')
  if (chiefComplaints === null || husbandBloodGroupCandidateIds === null) {
    return { status: 'error', message: 'The chief complaints could not be read.', retryable: false }
  }

  // Checkbox groups arrive as repeated values.
  const pinObservationIds = formData.getAll('pin').filter((v): v is string => typeof v === 'string')
  const unpinObservationIds = formData
    .getAll('unpin')
    .filter((v): v is string => typeof v === 'string')

  // Orders come from the type-ahead as a JSON list, because a test name can
  // itself contain a comma ("PT / INR, aPTT"). The comma-separated field is
  // still read when the list is absent.
  const orders = (jsonKey: string, textKey: string): unknown[] | null => {
    if (formData.get(jsonKey) === null) return list(formData, textKey)
    return parseList(jsonKey)
  }
  const labOrders = orders('labOrdersJson', 'labOrders')
  const scanOrders = orders('scanOrdersJson', 'scanOrders')
  if (labOrders === null || scanOrders === null) {
    return { status: 'error', message: 'The list of orders could not be read.', retryable: false }
  }

  // A reference is made only when the doctor named someone or wrote a reason.
  // A half-filled one is still sent, so the service can say what is missing
  // rather than silently dropping it.
  const refStaffUserId = text(formData, 'refStaffUserId')
  const refExternalName = text(formData, 'refExternalName')
  const refReason = text(formData, 'refReason')
  const reference =
    refStaffUserId || refExternalName || refReason
      ? {
          toStaffUserId: refStaffUserId,
          toExternalName: refExternalName,
          toSpecialty: text(formData, 'refSpecialty'),
          toFacility: text(formData, 'refFacility'),
          reason: refReason ?? '',
          urgency: text(formData, 'refUrgency') === 'URGENT' ? 'URGENT' : 'ROUTINE',
        }
      : null

  const input = {
    expectedVersion,
    impression: text(formData, 'impression'),
    examination: text(formData, 'examination'),
    perAbdomen: text(formData, 'perAbdomen'),
    perVaginum: text(formData, 'perVaginum'),
    perSpeculum: text(formData, 'perSpeculum'),
    chiefComplaints,
    husbandBloodGroupCandidateIds,
    diagnosis: text(formData, 'diagnosis'),
    summary: text(formData, 'summary'),
    reference,
    prescriptions,
    verifyCandidates,
    advice: {
      dfkcCounselled: checked(formData, 'dfkcCounselled'),
      nutritionCounselled: checked(formData, 'nutritionCounselled'),
      leftLateralRest: checked(formData, 'leftLateralRest'),
      dangerSignsCounselled: checked(formData, 'dangerSignsCounselled'),
      labOrders,
      scanOrders,
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
      // Validation carries zod issues; the first one's message is the sentence
      // a doctor can act on ("Say why she is being referred.").
      if (error.kind === 'VALIDATION') {
        const issues = error.details
        const first = Array.isArray(issues) ? (issues[0] as { message?: unknown } | undefined) : undefined
        if (typeof first?.message === 'string') {
          return { status: 'error', message: `${error.message} ${first.message}`, retryable: false }
        }
      }
      // A conflict means the visit moved under the editor, or an identical save
      // is already in flight. Either way the draft on screen is preserved — the
      // clinician refreshes and reconciles rather than losing what they typed.
      return { status: 'error', message: error.message, retryable: error.kind === 'CONFLICT' }
    }
    throw error
  }

  redirect('/clinic/scan' as Route)
}
