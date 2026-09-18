/**
 * Patient domain types.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework (see the module
 * anatomy table in docs/architecture.md).
 *
 * The recurring theme below is that clinical unknowns are modelled explicitly.
 * `bloodGroup: null` is not "she has no blood group" — it is "we have not
 * recorded one", and the two must render differently on a handover slip.
 */

import type { CalendarDate } from '@core/obstetrics/dating'

export type BloodGroup =
  | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG'
  | 'AB_POS' | 'AB_NEG' | 'O_POS' | 'O_NEG'

/** Tri-state for anything a clinician may simply not have asked yet. */
export type KnownStatus = 'UNKNOWN' | 'NONE_KNOWN' | 'KNOWN'

export type DataSource =
  | 'CLINICIAN_ENTERED'
  | 'STAFF_ENTERED'
  | 'EXTRACTED_VERIFIED'
  | 'PATIENT_REPORTED'
  | 'EXTERNAL_RECORD'

export type AbhaVerification = 'NOT_PROVIDED' | 'SELF_DECLARED' | 'VERIFIED'

export type ContactRelationship =
  | 'SELF' | 'HUSBAND' | 'MOTHER' | 'MOTHER_IN_LAW'
  | 'FATHER' | 'OTHER_RELATIVE' | 'NEIGHBOUR' | 'OTHER'

export type AllergySeverity = 'UNKNOWN' | 'MILD' | 'MODERATE' | 'SEVERE'

/**
 * Age as it is actually known.
 *
 * Most mothers in this setting state an age rather than produce a birth
 * certificate. Recording the date the age was stated is what keeps it
 * interpretable at a visit eight months later.
 */
export type PatientAge =
  | { readonly kind: 'DATE_OF_BIRTH'; readonly dateOfBirth: CalendarDate }
  | { readonly kind: 'ESTIMATED'; readonly years: number; readonly recordedOn: CalendarDate }

/**
 * A value together with where it came from.
 *
 * Provenance travels with the value rather than sitting in a parallel field,
 * because the referral snapshot must show both and they must not drift apart.
 */
export interface Sourced<T> {
  readonly value: T
  readonly source: DataSource
  readonly recordedOn: CalendarDate | null
}

export interface PatientAllergy {
  readonly id: string
  readonly substance: string
  readonly reaction: string | null
  readonly severity: AllergySeverity
  readonly source: DataSource
  readonly recordedAt: string
}

/**
 * Allergy state for display.
 *
 * A discriminated union rather than a nullable array, so that rendering code
 * cannot accidentally treat "not asked" as "none". `UNKNOWN` has no list to
 * map over, which is exactly the point.
 */
export type AllergyRecord =
  | { readonly status: 'UNKNOWN' }
  | { readonly status: 'NONE_KNOWN' }
  | { readonly status: 'KNOWN'; readonly allergies: readonly PatientAllergy[] }

export interface PatientContact {
  readonly id: string
  readonly phoneE164: string
  readonly relationship: ContactRelationship
  readonly contactName: string | null
  readonly isPrimary: boolean
  /** Inbound messages are matched against verified associations only. */
  readonly isVerified: boolean
  readonly hasMessagingConsent: boolean
}

/** The minimum needed to pick the right person out of a search result. */
export interface PatientIdentity {
  readonly id: string
  readonly uhid: string
  readonly fullName: string
  readonly age: PatientAge
}

/**
 * One row of an identity search, shaped by what the searcher may see.
 *
 * A union rather than nullable fields, and this is the whole reason: an
 * assistant may look a patient up to attach a slip, but may not read her
 * demographics. Expressing that as `age: PatientAge | null` would put "you are
 * not allowed to see this" into the same field as "we never recorded it", and
 * every renderer downstream would have to remember the difference. With a
 * discriminated union the assistant's result simply has no age to render —
 * there is nothing to get wrong (ARCH-10).
 */
export type PatientSearchResult =
  | {
      readonly visibility: 'IDENTITY_ONLY'
      readonly id: string
      readonly uhid: string
      readonly fullName: string
    }
  | {
      readonly visibility: 'FULL'
      readonly id: string
      readonly uhid: string
      readonly fullName: string
      readonly age: PatientAge
      readonly hasActiveQrToken: boolean
    }

/**
 * A freshly issued file sticker.
 *
 * `token` is present exactly once, in the response that mints it — it is stored
 * only as a hash, so this is the sole opportunity to print it.
 */
export interface IssuedPatientQr {
  readonly patientId: string
  readonly uhid: string
  readonly fullName: string
  readonly token: string
  readonly issuedAt: string
  /** True when this replaced a sticker that was still live. */
  readonly replacedPrevious: boolean
}

export interface Patient extends PatientIdentity {
  readonly clinicId: string
  readonly abhaId: string | null
  readonly abhaVerification: AbhaVerification
  readonly allergies: AllergyRecord
  readonly bloodGroup: Sourced<BloodGroup> | null
  readonly contacts: readonly PatientContact[]
  readonly hasActiveQrToken: boolean
  readonly version: number
}

/** Human-readable blood group, e.g. `O_NEG` → `O−`. */
export function formatBloodGroup(group: BloodGroup): string {
  const [letters, sign] = group.split('_')
  // A true minus sign, not a hyphen: at 2 AM on a printed slip the difference
  // between "O-" and "O−" is legibility, and Rh status is the field a receiving
  // unit reads first.
  return `${letters}${sign === 'POS' ? '+' : '−'}`
}

/** Rh-negative status drives the red header pill and the referral slip. */
export function isRhNegative(group: BloodGroup): boolean {
  return group.endsWith('_NEG')
}

/**
 * Age in years for display, or null when it cannot be stated.
 *
 * An estimated age recorded two years ago is deliberately NOT aged forward —
 * that would manufacture precision the record does not have.
 */
export function ageInYears(age: PatientAge, on: CalendarDate): number | null {
  if (age.kind === 'ESTIMATED') return age.years

  const birth = age.dateOfBirth
  let years = Number(on.slice(0, 4)) - Number(birth.slice(0, 4))
  if (on.slice(5) < birth.slice(5)) years -= 1
  return years >= 0 ? years : null
}

/**
 * How allergy state should read in the UI.
 *
 * Centralised so no screen invents its own wording and accidentally renders
 * "not asked" as reassurance.
 */
export function describeAllergies(record: AllergyRecord): string {
  switch (record.status) {
    case 'UNKNOWN':
      return 'Allergies not recorded'
    case 'NONE_KNOWN':
      return 'No known allergies'
    case 'KNOWN':
      return record.allergies.map((a) => a.substance).join(', ')
  }
}
