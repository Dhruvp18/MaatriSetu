import { describe, expect, it } from 'vitest'

import { FlagDiagnosesSchema } from '@modules/diagnoses/diagnosis.schema'
import { MenstrualHistoryInputSchema, SaveFamilyHistorySchema } from '@modules/history/history.schema'
import { PAST_HISTORY_OPTIONS } from '@modules/history/history.types'
import { DIAGNOSIS_OPTIONS } from '@modules/diagnoses/diagnosis.types'
import { UpdatePregnancyProfileSchema } from '@modules/pregnancies/pregnancy.schema'
import { toChiefComplaints } from '@modules/visits/visit.mapper'
import { SaveConsultationSchema } from '@modules/visits/visit.schema'
import { describeChiefComplaint } from '@modules/visits/visit.types'

const CANDIDATE = '6f1c1a52-7c1e-4b43-9a4f-2f3d6b1c9e01'
const PREGNANCY = '0b6b2a8e-4c55-4c1d-8a7e-6f0d7d1b2c33'

describe('chief complaints', () => {
  it('reads stored complaints and drops malformed entries', () => {
    expect(
      toChiefComplaints([
        { complaint: 'Headache', durationValue: 3, durationUnit: 'DAYS' },
        { complaint: '  ', durationValue: 1, durationUnit: 'DAYS' },
        { complaint: 'Swelling feet', durationValue: 2, durationUnit: 'FORTNIGHTS' },
        'not an object',
      ]),
    ).toEqual([
      { complaint: 'Headache', durationValue: 3, durationUnit: 'DAYS' },
      { complaint: 'Swelling feet', durationValue: null, durationUnit: null },
    ])
    expect(toChiefComplaints(null)).toEqual([])
  })

  it('writes the duration in words, singular for one', () => {
    expect(describeChiefComplaint({ complaint: 'Headache', durationValue: 3, durationUnit: 'DAYS' })).toBe(
      'Headache — 3 days',
    )
    expect(describeChiefComplaint({ complaint: 'Bleeding', durationValue: 1, durationUnit: 'WEEKS' })).toBe(
      'Bleeding — 1 week',
    )
    expect(describeChiefComplaint({ complaint: 'Nausea', durationValue: null, durationUnit: null })).toBe('Nausea')
  })

  it('refuses a number without a unit', () => {
    const result = SaveConsultationSchema.safeParse({
      expectedVersion: 1,
      chiefComplaints: [{ complaint: 'Pain', durationValue: 2, durationUnit: null }],
    })
    expect(result.success).toBe(false)
  })
})

describe('husband blood group', () => {
  it('may only relabel a value verified in the same save', () => {
    expect(
      SaveConsultationSchema.safeParse({ expectedVersion: 1, husbandBloodGroupCandidateIds: [CANDIDATE] }).success,
    ).toBe(false)

    expect(
      SaveConsultationSchema.safeParse({
        expectedVersion: 1,
        husbandBloodGroupCandidateIds: [CANDIDATE],
        verifyCandidates: [{ candidateId: CANDIDATE, correctionVersion: 0, category: 'HEMATOLOGY' }],
      }).success,
    ).toBe(true)
  })
})

describe('flagged diagnoses', () => {
  it('offers the OPD list for each section', () => {
    expect(DIAGNOSIS_OPTIONS.SCANS).toContain('Placenta previa')
    expect(DIAGNOSIS_OPTIONS.REPORTS).toContain('APLA')
    expect(DIAGNOSIS_OPTIONS.EXAMINATION).toEqual(['Breech presentation', 'Small for gestational age', 'Transverse lie'])
  })

  it('needs at least one label', () => {
    expect(FlagDiagnosesSchema.safeParse({ pregnancyId: PREGNANCY, section: 'SCANS', labels: [] }).success).toBe(false)
    expect(
      FlagDiagnosesSchema.safeParse({ pregnancyId: PREGNANCY, section: 'SCANS', labels: ['Kyphosis'] }).success,
    ).toBe(true)
  })
})

describe('pregnancy profile', () => {
  it('accepts not-asked as null and rejects an implausible height', () => {
    const base = { pregnancyId: PREGNANCY, expectedVersion: 2, marriedYears: null, consanguinity: null, conceptionMode: null }
    expect(UpdatePregnancyProfileSchema.safeParse({ ...base, heightCm: null }).success).toBe(true)
    expect(UpdatePregnancyProfileSchema.safeParse({ ...base, heightCm: 14.8 }).success).toBe(false)
    expect(
      UpdatePregnancyProfileSchema.safeParse({ ...base, heightCm: 148, consanguinity: 'CONSANGUINEOUS', conceptionMode: 'IVF' })
        .success,
    ).toBe(true)
  })
})

describe('family and past history', () => {
  const PATIENT = '9a7d2f0e-1b2c-4d3e-8f4a-5b6c7d8e9f00'

  it('needs a relation and a disease, and refuses onset after current age', () => {
    const entry = { relation: 'Husband', vitalStatus: 'ALIVE', disease: 'Diabetes', onsetAgeYears: 30, currentAgeYears: 35 }
    expect(SaveFamilyHistorySchema.safeParse({ patientId: PATIENT, entry }).success).toBe(true)
    expect(SaveFamilyHistorySchema.safeParse({ patientId: PATIENT, entry: { ...entry, disease: ' ' } }).success).toBe(false)
    expect(SaveFamilyHistorySchema.safeParse({ patientId: PATIENT, entry: { ...entry, onsetAgeYears: 40 } }).success).toBe(false)
  })

  it('needs the read version to edit a family-history row', () => {
    const entry = { relation: 'Mother', disease: 'Hypertension' }
    expect(SaveFamilyHistorySchema.safeParse({ patientId: PATIENT, entryId: PATIENT, entry }).success).toBe(false)
    expect(
      SaveFamilyHistorySchema.safeParse({ patientId: PATIENT, entryId: PATIENT, expectedVersion: 2, entry }).success,
    ).toBe(true)
  })

  it('offers the four past-history conditions', () => {
    expect(PAST_HISTORY_OPTIONS).toEqual(['Epilepsy', 'Asthma', 'Cardiovascular disorders', 'Tuberculosis'])
  })

  it('takes the last Pap smear as a calendar date', () => {
    expect(MenstrualHistoryInputSchema.safeParse({ lastPapSmearOn: '2025-03-10' }).success).toBe(true)
    expect(MenstrualHistoryInputSchema.safeParse({ lastPapSmearOn: '10/03/2025' }).success).toBe(false)
  })
})
