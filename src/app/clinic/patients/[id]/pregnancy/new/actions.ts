'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { createPregnancy } from '@modules/pregnancies/pregnancy.service'

/**
 * Open a pregnancy episode.
 *
 * The form's only real job is assembling the dating union. Everything a
 * clinician might get wrong — an implausible gestational age, a parity that
 * exceeds gravida, a caesarean recorded without its scar — is checked by the
 * schema and the service, and reported back here rather than re-implemented.
 */

export type CreatePregnancyState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Parse an optional number field. Blank stays blank; it is not zero. */
const num = (form: FormData, key: string): number | null => {
  const raw = text(form, key)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Build the discriminated dating input from the form.
 *
 * Each branch carries only its own fields. The schema rejects extras, so a
 * stale scan date left in a hidden input cannot ride along with an LMP and be
 * silently dropped — which is exactly the bug `.strict()` on those branches was
 * added to catch.
 */
function datingFrom(form: FormData): unknown {
  switch (text(form, 'datingMethod')) {
    case 'LMP': {
      return {
        method: 'LMP',
        lmp: text(form, 'lmp') ?? '',
        certainty: text(form, 'lmpCertainty') ?? 'UNKNOWN',
      }
    }

    case 'ULTRASOUND': {
      // Reports state gestation as "12w + 3d", so the form asks for it that
      // way and converts. Asking a nurse to supply 87 days would invite
      // arithmetic slips at a counter.
      const weeks = num(form, 'scanGaWeeks') ?? 0
      const days = num(form, 'scanGaDays') ?? 0

      return {
        method: 'ULTRASOUND',
        scanDate: text(form, 'scanDate') ?? '',
        gaDaysAtScan: Math.round(weeks * 7 + days),
        certainty: 'CERTAIN',
      }
    }

    default:
      // Explicitly no anchor, rather than the absence of a choice. The record
      // then reads "Dating not established" instead of showing a guess.
      return { method: 'NONE' }
  }
}

export async function submitPregnancy(
  _previous: CreatePregnancyState,
  formData: FormData,
): Promise<CreatePregnancyState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const patientId = text(formData, 'patientId')
  if (patientId === null) {
    return { status: 'error', message: 'No patient was specified.' }
  }

  const input = {
    patientId,
    dating: datingFrom(formData),
    // Kept verbatim even when dating comes from a scan: it is part of the
    // record of what she said.
    reportedLmp: text(formData, 'reportedLmp'),
    reportedLmpCertainty: text(formData, 'reportedLmpCertainty') ?? 'UNKNOWN',
    gravidaParity: {
      gravida: num(formData, 'gravida'),
      parity: num(formData, 'parity'),
      living: num(formData, 'living'),
      abortions: num(formData, 'abortions'),
    },
    prePregnancyWeightKg: num(formData, 'prePregnancyWeightKg'),
    heightCm: num(formData, 'heightCm'),
  }

  try {
    await createPregnancy(session.actor, input)
  } catch (error) {
    if (error instanceof AppError) {
      // An existing active pregnancy is a conflict, not a failure to record
      // this one. The message names the situation so the counter opens the
      // episode she already has instead of inventing a second.
      return { status: 'error', message: error.message }
    }
    throw error
  }

  // Booked: straight into her cockpit, where her existing reports are added.
  redirect(`/clinic/patients/${patientId}/cockpit` as Route)
}
