'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { registerPatient } from '@modules/patients/patient.service'

/**
 * Registration form submission.
 *
 * Thin by rule (ARCH-1): reshape the form into the service's input, call the
 * service, translate failures into something a person at a counter can act on.
 * Every validation rule and every permission check lives behind
 * `registerPatient` — this file re-implements none of them, so the form cannot
 * drift from what the server will accept.
 */

export type RegistrationState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string; readonly field: string | null }
  | {
      readonly status: 'registered'
      readonly patientId: string
      readonly uhid: string
      readonly fullName: string
    }

const text = (form: FormData, key: string): string | null => {
  const value = form.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function submitRegistration(
  _previous: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.', field: null }
  }

  const { actor } = session

  // Age is a union in the domain: either a documented date of birth, or a
  // stated estimate together with the day it was stated. Assembling it here
  // keeps that distinction intact instead of flattening it into two loose
  // fields that could both be blank.
  const ageKind = text(formData, 'ageKind') === 'DATE_OF_BIRTH' ? 'DATE_OF_BIRTH' : 'ESTIMATED'
  const age =
    ageKind === 'DATE_OF_BIRTH'
      ? { kind: 'DATE_OF_BIRTH' as const, dateOfBirth: text(formData, 'dateOfBirth') ?? '' }
      : {
          kind: 'ESTIMATED' as const,
          years: Number(text(formData, 'ageYears') ?? Number.NaN),
          // The clinic's calendar day, not the server's. Recording when an age
          // was stated is what keeps it interpretable months later.
          recordedOn: todayIn(actor.clinicTimezone),
        }

  const allergyStatus = text(formData, 'allergyStatus') ?? 'UNKNOWN'

  // Comma-separated so a nurse can type "penicillin, sulpha" in one field. The
  // service still stores each as its own row.
  const allergies =
    allergyStatus === 'KNOWN'
      ? (text(formData, 'allergySubstances') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((substance) => ({ substance, source: 'PATIENT_REPORTED' as const }))
      : []

  const phone = text(formData, 'phone')
  const bloodGroup = text(formData, 'bloodGroup')

  const input = {
    uhid: text(formData, 'uhid') ?? '',
    fullName: text(formData, 'fullName') ?? '',
    age,
    abhaId: text(formData, 'abhaId'),
    allergyStatus,
    allergies,
    bloodGroup,
    // Typed at the counter from what the mother or her card says. Not
    // EXTRACTED_VERIFIED — nothing here has read a report.
    bloodGroupSource: bloodGroup ? 'STAFF_ENTERED' : null,
    bloodGroupRecordedOn: bloodGroup ? todayIn(actor.clinicTimezone) : null,
    contacts: phone
      ? [
          {
            phone,
            relationship: text(formData, 'relationship') ?? 'SELF',
            isPrimary: true,
            // Consent for messaging is captured separately and deliberately.
            // Registering a number is not agreeing to be messaged.
            hasMessagingConsent: false,
          },
        ]
      : [],
  }

  let patientId: string
  try {
    const patient = await registerPatient(actor, input)
    patientId = patient.id
  } catch (error) {
    if (error instanceof AppError) {
      // The service reports a duplicate file number as a conflict. Surfacing it
      // as-is matters: at a counter the right response is to look the existing
      // patient up, not to invent a new number.
      const field =
        error.code === 'UHID_TAKEN'
          ? 'uhid'
          : firstFieldFromIssues(error.details)
      
      console.error('Validation failed with issues:', JSON.stringify(error.details, null, 2))

      let message = error.message
      if (error.kind === 'VALIDATION' && Array.isArray(error.details) && error.details.length > 0) {
        // Zod issues have a 'message' property
        const issue = error.details[0] as { message?: string }
        if (issue.message) {
          message = issue.message
        }
      }

      return { status: 'error', message, field }
    }

    throw error
  }

  // Straight on to booking this pregnancy, which lands in her cockpit. Outside
  // the try: redirect() signals by throwing.
  redirect(`/clinic/patients/${patientId}/pregnancy/new` as Route)
}

/** Pull a field name out of zod issues, so the form can highlight it. */
function firstFieldFromIssues(details: unknown): string | null {
  if (!Array.isArray(details)) {
    if (details && typeof details === 'object' && 'field' in details) {
      const field = (details as { field: unknown }).field
      return typeof field === 'string' ? field : null
    }
    return null
  }

  const first = details[0]
  if (first && typeof first === 'object' && 'path' in first) {
    const path = (first as { path: unknown }).path
    if (Array.isArray(path) && typeof path[0] === 'string') return path[0]
  }
  return null
}
