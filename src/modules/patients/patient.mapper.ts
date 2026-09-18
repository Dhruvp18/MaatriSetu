import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'

import type {
  AllergyRecord,
  Patient,
  PatientAge,
  PatientAllergy,
  PatientContact,
  PatientIdentity,
} from './patient.types'

/**
 * Database rows, and how they become domain objects.
 *
 * Split out of the repository so it can be tested without a database. The
 * decisions in this file are the ones that go wrong quietly: an absent allergy
 * list read as reassurance, a blood group shown without its provenance, an
 * estimated age silently aged forward. None of those throw — they render, and a
 * clinician believes them. So they get their own file and their own tests.
 *
 * Row shapes come from `database.types.ts`, generated from the live schema by
 * `pnpm db:types`. They are not restated here: a hand-written copy drifts from
 * the schema silently, and the compiler cannot see the drift. Regenerate after
 * every migration.
 *
 * Because the generated types carry the real Postgres enums rather than bare
 * strings, the domain unions below line up with the columns without a cast — so
 * adding a value to a database enum becomes a compile error here rather than a
 * runtime surprise.
 */

type Tables = Database['public']['Tables']

/** `patients` — see supabase/migrations/0003_patients.sql. */
export type PatientRow = Tables['patients']['Row']

/** `patient_allergies` — status is on the patient; these are the listed items. */
export type PatientAllergyRow = Tables['patient_allergies']['Row']

/** `patient_contacts` — many-to-many with patients by design. */
export type PatientContactRow = Tables['patient_contacts']['Row']

/** The subset a search needs. Narrower than the full row, on purpose. */
export type PatientIdentityRow = Pick<
  PatientRow,
  | 'id'
  | 'clinic_id'
  | 'uhid'
  | 'full_name'
  | 'date_of_birth'
  | 'estimated_age_years'
  | 'age_recorded_on'
  | 'qr_token_hash'
  | 'qr_token_revoked_at'
  | 'version'
>

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

type AgeColumns = Pick<PatientRow, 'date_of_birth' | 'estimated_age_years' | 'age_recorded_on'>

/**
 * Age, as the record actually knows it.
 *
 * A date of birth wins when present. Otherwise the estimate is returned with
 * the date it was stated, and never aged forward — "26, told to us 240 days
 * ago" is what the clinic knows, and turning that into "27 today" would invent
 * precision.
 */
export function toAge(row: AgeColumns): PatientAge {
  if (row.date_of_birth !== null) {
    return { kind: 'DATE_OF_BIRTH', dateOfBirth: row.date_of_birth }
  }

  // `patients_age_known` guarantees one of the two is present, and
  // `patients_estimated_age_dated` guarantees an estimate carries its date. If
  // either is missing, the row types have drifted from the schema or the row
  // predates the constraints. Neither is something to paper over with a guess.
  if (row.estimated_age_years === null || row.age_recorded_on === null) {
    throw internal('A patient row carries neither a date of birth nor a dated age estimate.')
  }

  return {
    kind: 'ESTIMATED',
    years: row.estimated_age_years,
    recordedOn: row.age_recorded_on,
  }
}

/**
 * Allergy state.
 *
 * The status column is the truth; the row count never is. A KNOWN status whose
 * rows did not load yields an empty KNOWN list, which reads as a data problem.
 * Deriving NONE_KNOWN from "no rows" would read as reassurance, and would be
 * the exact defect migration 0003 replaced `allergies text[]` to prevent.
 */
export function toAllergyRecord(
  status: PatientRow['allergy_status'],
  rows: readonly PatientAllergyRow[],
): AllergyRecord {
  if (status === 'UNKNOWN') return { status: 'UNKNOWN' }
  if (status === 'NONE_KNOWN') return { status: 'NONE_KNOWN' }

  const allergies: PatientAllergy[] = rows
    // A retracted allergy stays in the table — that it was once believed is
    // itself clinically relevant — but it is not a current allergy.
    .filter((row) => row.retracted_at === null)
    .map((row) => ({
      id: row.id,
      substance: row.substance,
      reaction: row.reaction,
      severity: row.severity,
      source: row.source,
      recordedAt: row.recorded_at,
    }))

  return { status: 'KNOWN', allergies }
}

export function toContact(row: PatientContactRow): PatientContact {
  return {
    id: row.id,
    phoneE164: row.phone_e164,
    relationship: row.relationship,
    contactName: row.contact_name,
    isPrimary: row.is_primary,
    // Verification gates inbound voice matching. It is a recorded act with a
    // verifier, not a default.
    isVerified: row.verified_at !== null,
    // Consent given and later withdrawn is not consent.
    hasMessagingConsent:
      row.messaging_consent_at !== null && row.messaging_consent_withdrawn_at === null,
  }
}

/** A sticker that exists and has not been retired. */
export function hasLiveQrToken(
  row: Pick<PatientRow, 'qr_token_hash' | 'qr_token_revoked_at'>,
): boolean {
  return row.qr_token_hash !== null && row.qr_token_revoked_at === null
}

export function toIdentity(row: PatientIdentityRow): PatientIdentity {
  return { id: row.id, uhid: row.uhid, fullName: row.full_name, age: toAge(row) }
}

export function toPatient(
  row: PatientRow,
  allergyRows: readonly PatientAllergyRow[],
  contactRows: readonly PatientContactRow[],
): Patient {
  return {
    id: row.id,
    uhid: row.uhid,
    fullName: row.full_name,
    age: toAge(row),
    clinicId: row.clinic_id,
    abhaId: row.abha_id,
    abhaVerification: row.abha_verification,
    allergies: toAllergyRecord(row.allergy_status, allergyRows),
    // `patients_blood_group_has_provenance` makes these two columns rise and
    // fall together. Requiring both here means a group can never reach a
    // referral slip without the reader being able to see where it came from.
    bloodGroup:
      row.blood_group === null || row.blood_group_source === null
        ? null
        : {
            value: row.blood_group,
            source: row.blood_group_source,
            recordedOn: row.blood_group_recorded_on,
          },
    contacts: contactRows.map(toContact),
    hasActiveQrToken: hasLiveQrToken(row),
    version: row.version,
  }
}
