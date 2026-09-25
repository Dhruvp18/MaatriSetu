import { describe, expect, it } from 'vitest'

import {
  formatBloodPressure,
  formatGlucose,
  metricsForDiagnoses,
} from '@modules/monitoring/monitoring.types'

describe('metricsForDiagnoses', () => {
  it('enables the sugar log for a diabetes diagnosis, however it is worded', () => {
    expect(metricsForDiagnoses(['Gestational diabetes'])).toEqual(['BLOOD_GLUCOSE'])
    expect(metricsForDiagnoses(['Overt diabetes'])).toEqual(['BLOOD_GLUCOSE'])
    expect(metricsForDiagnoses(['GDM'])).toEqual(['BLOOD_GLUCOSE'])
  })

  it('enables the BP log for a hypertensive disorder, however it is worded', () => {
    expect(metricsForDiagnoses(['Gestational hypertension'])).toEqual(['BLOOD_PRESSURE'])
    expect(metricsForDiagnoses(['Pre-eclampsia'])).toEqual(['BLOOD_PRESSURE'])
    expect(metricsForDiagnoses(['PIH'])).toEqual(['BLOOD_PRESSURE'])
  })

  it('enables both when both are flagged, sugar first regardless of flag order', () => {
    expect(metricsForDiagnoses(['Pre-eclampsia', 'Gestational diabetes'])).toEqual([
      'BLOOD_GLUCOSE',
      'BLOOD_PRESSURE',
    ])
  })

  it('is case-insensitive', () => {
    expect(metricsForDiagnoses(['GESTATIONAL DIABETES'])).toEqual(['BLOOD_GLUCOSE'])
  })

  it('enables nothing for an unrelated or empty diagnosis list', () => {
    expect(metricsForDiagnoses(['Polyhydramnios'])).toEqual([])
    expect(metricsForDiagnoses([])).toEqual([])
  })

  it('never duplicates a metric matched by more than one flagged label', () => {
    expect(metricsForDiagnoses(['Gestational diabetes', 'Overt diabetes'])).toEqual(['BLOOD_GLUCOSE'])
  })
})

describe('formatting a home reading', () => {
  it('prints glucose with its unit and context', () => {
    expect(formatGlucose({ mgDl: 96, context: 'FASTING' })).toBe('96 mg/dL (Fasting)')
  })

  it('prints blood pressure as systolic over diastolic with its unit', () => {
    expect(formatBloodPressure({ systolicMmHg: 128, diastolicMmHg: 82 })).toBe('128/82 mmHg')
  })
})
