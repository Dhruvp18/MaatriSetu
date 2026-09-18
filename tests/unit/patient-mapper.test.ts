import { describe, expect, it } from 'vitest'

import { AppError } from '@core/errors/app-error'
import {
  hasLiveQrToken,
  type PatientAllergyRow,
  type PatientContactRow,
  type PatientRow,
  toAge,
  toAllergyRecord,
  toContact,
  toPatient,
} from '@modules/patients/patient.mapper'
import { describeAllergies } from '@modules/patients/patient.types'

/**
 * These cover the failure modes that do not throw.
 *
 * A mapping bug here does not crash — it renders, and a clinician reads it and
 * believes it. "No known allergies" on a woman nobody asked, a blood group with
 * no provenance on a handover slip, a retired sticker that still opens a
 * record: each is a plausible-looking screen that is wrong.
 */

const PATIENT_ROW: PatientRow = {
  id: '44444444-4444-4444-8444-00000000000a',
  clinic_id: '11111111-1111-4111-8111-000000000001',
  uhid: 'MH-2026-89412',
  full_name: 'Sunita Devi',
  date_of_birth: null,
  estimated_age_years: 26,
  age_recorded_on: '2026-01-21',
  abha_id: null,
  abha_verification: 'NOT_PROVIDED',
  allergy_status: 'UNKNOWN',
  blood_group: null,
  blood_group_source: null,
  blood_group_recorded_on: null,
  qr_token_hash: null,
  qr_token_issued_at: null,
  qr_token_revoked_at: null,
  created_by: null,
  created_at: '2026-01-21T04:00:00.000Z',
  updated_at: '2026-01-21T04:00:00.000Z',
  version: 1,
}

const ALLERGY_ROW: PatientAllergyRow = {
  id: 'a1',
  clinic_id: PATIENT_ROW.clinic_id,
  patient_id: PATIENT_ROW.id,
  substance: 'Penicillin',
  reaction: 'Urticarial rash',
  severity: 'MODERATE',
  source: 'PATIENT_REPORTED',
  recorded_by: null,
  recorded_at: '2026-01-21T04:00:00.000Z',
  retracted_at: null,
  retracted_by: null,
  retraction_reason: null,
  created_at: '2026-01-21T04:00:00.000Z',
  updated_at: '2026-01-21T04:00:00.000Z',
  version: 1,
}

const CONTACT_ROW: PatientContactRow = {
  id: 'c1',
  clinic_id: PATIENT_ROW.clinic_id,
  patient_id: PATIENT_ROW.id,
  phone_e164: '+919833100001',
  relationship: 'SELF',
  contact_name: 'Sunita Devi',
  is_primary: true,
  messaging_consent_at: null,
  messaging_consent_withdrawn_at: null,
  verified_at: null,
  verified_by: null,
  created_at: '2026-01-21T04:00:00.000Z',
  updated_at: '2026-01-21T04:00:00.000Z',
  version: 1,
}

describe('toAge', () => {
  it('prefers a recorded date of birth', () => {
    expect(toAge({ date_of_birth: '1999-04-02', estimated_age_years: 26, age_recorded_on: '2026-01-21' }))
      .toEqual({ kind: 'DATE_OF_BIRTH', dateOfBirth: '1999-04-02' })
  })

  it('keeps an estimate tied to the date it was stated', () => {
    expect(toAge({ date_of_birth: null, estimated_age_years: 26, age_recorded_on: '2026-01-21' }))
      .toEqual({ kind: 'ESTIMATED', years: 26, recordedOn: '2026-01-21' })
  })

  it('refuses an estimate with no date rather than inventing one', () => {
    expect(() =>
      toAge({ date_of_birth: null, estimated_age_years: 26, age_recorded_on: null }),
    ).toThrow(AppError)
  })

  it('refuses a row with no age at all', () => {
    expect(() =>
      toAge({ date_of_birth: null, estimated_age_years: null, age_recorded_on: null }),
    ).toThrow(AppError)
  })
})

describe('toAllergyRecord', () => {
  it('reports UNKNOWN as unknown, not as none', () => {
    const record = toAllergyRecord('UNKNOWN', [])
    expect(record.status).toBe('UNKNOWN')
    expect(describeAllergies(record)).toBe('Allergies not recorded')
  })

  it('reports NONE_KNOWN only when the column says so', () => {
    const record = toAllergyRecord('NONE_KNOWN', [])
    expect(record.status).toBe('NONE_KNOWN')
    expect(describeAllergies(record)).toBe('No known allergies')
  })

  it('never derives NONE_KNOWN from an absence of rows', () => {
    // The whole reason migration 0003 replaced `allergies text[]`: an empty
    // list must not become a negative clinical finding.
    const record = toAllergyRecord('KNOWN', [])
    expect(record.status).toBe('KNOWN')
    expect(describeAllergies(record)).not.toBe('No known allergies')
  })

  it('carries substance, reaction, severity and provenance through', () => {
    const record = toAllergyRecord('KNOWN', [ALLERGY_ROW])
    if (record.status !== 'KNOWN') throw new Error('expected KNOWN')

    expect(record.allergies).toHaveLength(1)
    expect(record.allergies[0]).toMatchObject({
      substance: 'Penicillin',
      reaction: 'Urticarial rash',
      severity: 'MODERATE',
      source: 'PATIENT_REPORTED',
    })
  })

  it('drops a retracted allergy from the current list', () => {
    const retracted: PatientAllergyRow = { ...ALLERGY_ROW, id: 'a2', retracted_at: '2026-02-01T00:00:00.000Z' }
    const record = toAllergyRecord('KNOWN', [ALLERGY_ROW, retracted])
    if (record.status !== 'KNOWN') throw new Error('expected KNOWN')

    expect(record.allergies.map((a) => a.id)).toEqual(['a1'])
  })

  it('ignores rows entirely when the status is not KNOWN', () => {
    // Defensive: if the status column and the rows ever disagree, the column
    // wins. Rendering an allergy under a NONE_KNOWN status would be incoherent.
    expect(toAllergyRecord('NONE_KNOWN', [ALLERGY_ROW])).toEqual({ status: 'NONE_KNOWN' })
  })
})

describe('toContact', () => {
  it('treats an unverified association as unverified', () => {
    expect(toContact(CONTACT_ROW).isVerified).toBe(false)
  })

  it('treats a verified association as verified', () => {
    expect(toContact({ ...CONTACT_ROW, verified_at: '2026-01-21T04:00:00.000Z' }).isVerified).toBe(true)
  })

  it('reports consent when it was given and not withdrawn', () => {
    expect(
      toContact({ ...CONTACT_ROW, messaging_consent_at: '2026-01-21T04:00:00.000Z' })
        .hasMessagingConsent,
    ).toBe(true)
  })

  it('reports withdrawn consent as no consent', () => {
    expect(
      toContact({
        ...CONTACT_ROW,
        messaging_consent_at: '2026-01-21T04:00:00.000Z',
        messaging_consent_withdrawn_at: '2026-03-01T00:00:00.000Z',
      }).hasMessagingConsent,
    ).toBe(false)
  })
})

describe('hasLiveQrToken', () => {
  it('is false when no sticker was ever issued', () => {
    expect(hasLiveQrToken({ qr_token_hash: null, qr_token_revoked_at: null })).toBe(false)
  })

  it('is true for an issued, unrevoked sticker', () => {
    expect(hasLiveQrToken({ qr_token_hash: '\\xdead', qr_token_revoked_at: null })).toBe(true)
  })

  it('is false once the sticker is revoked, even though the hash remains', () => {
    // The hash stays so the row keeps its history; a lost file must stop
    // opening the record regardless.
    expect(
      hasLiveQrToken({ qr_token_hash: '\\xdead', qr_token_revoked_at: '2026-03-01T00:00:00.000Z' }),
    ).toBe(false)
  })
})

describe('toPatient', () => {
  it('assembles a whole patient', () => {
    const patient = toPatient(
      { ...PATIENT_ROW, allergy_status: 'KNOWN' },
      [ALLERGY_ROW],
      [CONTACT_ROW],
    )

    expect(patient.uhid).toBe('MH-2026-89412')
    expect(patient.fullName).toBe('Sunita Devi')
    expect(patient.age).toEqual({ kind: 'ESTIMATED', years: 26, recordedOn: '2026-01-21' })
    expect(patient.allergies.status).toBe('KNOWN')
    expect(patient.contacts).toHaveLength(1)
    expect(patient.version).toBe(1)
  })

  it('returns a blood group together with its provenance', () => {
    const patient = toPatient(
      {
        ...PATIENT_ROW,
        blood_group: 'O_NEG',
        blood_group_source: 'EXTRACTED_VERIFIED',
        blood_group_recorded_on: '2026-01-28',
      },
      [],
      [],
    )

    expect(patient.bloodGroup).toEqual({
      value: 'O_NEG',
      source: 'EXTRACTED_VERIFIED',
      recordedOn: '2026-01-28',
    })
  })

  it('withholds a blood group that arrived without provenance', () => {
    // `patients_blood_group_has_provenance` should make this unreachable. If it
    // ever is reached, a group with no source must not land on a referral slip
    // where the reader cannot tell whether it was typed or transcribed.
    const patient = toPatient({ ...PATIENT_ROW, blood_group: 'O_NEG' }, [], [])
    expect(patient.bloodGroup).toBeNull()
  })

  it('reports no blood group as absent rather than as a value', () => {
    expect(toPatient(PATIENT_ROW, [], []).bloodGroup).toBeNull()
  })
})
