import { describe, expect, it } from 'vitest'

import { type RosterSources, assembleRoster } from '@modules/roster/roster.mapper'
import { formatGravidaParity, hasRecordedFlags } from '@modules/roster/roster.types'

const patient = (id: string, overrides: Partial<RosterSources['patients'][number]> = {}) => ({
  id,
  uhid: `U-${id}`,
  full_name: `Patient ${id}`,
  date_of_birth: null,
  estimated_age_years: 26,
  age_recorded_on: '2026-09-01',
  allergy_status: 'NONE_KNOWN' as const,
  blood_group: 'B_POS' as const,
  ...overrides,
})

const pregnancy = (id: string, patientId: string, overrides: Partial<RosterSources['pregnancies'][number]> = {}) => ({
  id,
  patient_id: patientId,
  dating_reference_date: '2026-06-01',
  dating_reference_ga_days: 0,
  gravida: 2,
  parity: 1,
  living: 1,
  abortions: 0,
  created_at: '2026-06-10T00:00:00Z',
  ...overrides,
})

const empty: RosterSources = {
  patients: [],
  pregnancies: [],
  visits: [],
  scarredPatientIds: [],
  flaggedDiagnoses: [],
  flaggedHistory: [],
}

describe('patient roster', () => {
  it('keeps her latest visit and her open episode', () => {
    const [entry] = assembleRoster({
      ...empty,
      patients: [patient('p1')],
      pregnancies: [pregnancy('g1', 'p1')],
      visits: [
        { patient_id: 'p1', occurred_at: '2026-08-01T05:00:00Z', diagnosis: null },
        { patient_id: 'p1', occurred_at: '2026-09-10T05:00:00Z', diagnosis: 'Anaemia' },
      ],
    })
    expect(entry?.lastVisitAt).toBe('2026-09-10T05:00:00Z')
    expect(entry?.pregnancy?.id).toBe('g1')
    expect(entry?.pregnancy?.dating).toEqual({ referenceDate: '2026-06-01', referenceGaDays: 0 })
  })

  it('reads a half dating anchor as not established rather than failing the list', () => {
    const [entry] = assembleRoster({
      ...empty,
      patients: [patient('p1')],
      pregnancies: [pregnancy('g1', 'p1', { dating_reference_ga_days: null })],
    })
    expect(entry?.pregnancy?.dating).toBeNull()
  })

  it('flags only recorded facts', () => {
    const list = assembleRoster({
      ...empty,
      patients: [
        patient('rh', { blood_group: 'O_NEG' }),
        patient('allergy', { allergy_status: 'KNOWN' }),
        patient('scar'),
        patient('unasked', { allergy_status: 'UNKNOWN', blood_group: null }),
      ],
      scarredPatientIds: ['scar'],
    })
    expect(list.map((e) => e.flags)).toEqual([['RH_NEGATIVE'], ['ALLERGY'], ['UTERINE_SCAR'], []])
    expect(list.filter(hasRecordedFlags)).toHaveLength(3)
  })

  it('carries the cockpit’s flagged diagnoses for the current episode only', () => {
    const list = assembleRoster({
      ...empty,
      patients: [patient('p1'), patient('p2')],
      pregnancies: [pregnancy('g1', 'p1'), pregnancy('g2', 'p2')],
      flaggedDiagnoses: [
        { patient_id: 'p1', pregnancy_id: 'g1', label: 'Anaemia' },
        { patient_id: 'p2', pregnancy_id: 'g-old', label: 'IUGR' },
      ],
    })
    expect(list.map((e) => e.flaggedDiagnoses)).toEqual([['Anaemia'], []])
    expect(list.filter(hasRecordedFlags).map((e) => e.patientId)).toEqual(['p1'])
  })

  it('counts flagged history entries', () => {
    const [entry] = assembleRoster({
      ...empty,
      patients: [patient('p1')],
      flaggedHistory: [{ patient_id: 'p1' }, { patient_id: 'p1' }, { patient_id: 'p9' }],
    })
    expect(entry?.flaggedHistoryCount).toBe(2)
    expect(entry && hasRecordedFlags(entry)).toBe(true)
  })

  it('writes GPLA with a dash for anything not asked', () => {
    expect(formatGravidaParity({ gravida: 2, parity: 1, living: null, abortions: 0 })).toBe('G2 P1 L– A0')
  })
})
