import { describe, expect, it } from 'vitest'

import { RecordVitalsSchema } from '@modules/visits/visit.schema'
import {
  bloodPressureSeries,
  formatBloodPressure,
  formatDipstick,
  hasAnyMeasurement,
  latestVitals,
  vitalsAsQuantities,
  type VitalsReading,
} from '@modules/visits/visit.types'

/**
 * Vitals are where ARCH-9 (units travel with values) and ARCH-10 (unknown is
 * not absent) meet. A bug here does not throw — it prints a number on a
 * handover slip without its unit, or leaves a blank where "not tested" was
 * meant, and a reader at 2 AM fills in the gap themselves.
 */

const reading = (over: Partial<VitalsReading> = {}): VitalsReading => ({
  id: 'v1',
  sequenceNo: 1,
  bloodPressure: null,
  pulseBpm: null,
  respiratoryRateBpm: null,
  temperatureC: null,
  spo2Percent: null,
  weightKg: null,
  fundalHeightCm: null,
  fetalHeartRateBpm: null,
  urineAlbumin: null,
  urineSugar: null,
  urineSugarMgDl: null,
  note: null,
  recordedAt: '2026-09-18T09:00:00.000Z',
  recordedBy: null,
  ...over,
})

describe('vitalsAsQuantities', () => {
  it('carries a unit with every measurement', () => {
    const quantities = vitalsAsQuantities(
      reading({
        bloodPressure: { systolicMmHg: 148, diastolicMmHg: 96 },
        pulseBpm: 88,
        temperatureC: 36.8,
        weightKg: 58.5,
        fundalHeightCm: 30,
        fetalHeartRateBpm: 142,
        spo2Percent: 98,
        respiratoryRateBpm: 18,
      }),
    )

    // Dipstick grades are the only unitless values, and none is present here.
    for (const q of quantities) {
      expect(q.unit, `${q.label} lost its unit`).not.toBe('')
    }
  })

  it('emits nothing for a value that was not taken', () => {
    // A blank next to a label on a referral slip invites the reader to treat it
    // as normal. Absent values are absent, not empty.
    expect(vitalsAsQuantities(reading({ pulseBpm: 88 }))).toEqual([
      { label: 'Pulse', value: '88', unit: 'bpm' },
    ])
  })

  it('renders blood pressure as one value with one unit', () => {
    expect(
      vitalsAsQuantities(reading({ bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80 } })),
    ).toEqual([{ label: 'BP', value: '120/80', unit: 'mmHg' }])
  })

  it('keeps one decimal on weight and temperature', () => {
    const q = vitalsAsQuantities(reading({ weightKg: 58, temperatureC: 37 }))
    expect(q.find((x) => x.label === 'Weight')?.value).toBe('58.0')
    expect(q.find((x) => x.label === 'Temp')?.value).toBe('37.0')
  })

  it('shows a recorded NIL dipstick rather than omitting it', () => {
    // NIL is a result: the test was done and was negative. Omitting it would
    // make it indistinguishable from never having tested.
    const q = vitalsAsQuantities(reading({ urineAlbumin: 'NIL' }))
    expect(q).toEqual([{ label: 'Urine albumin', value: 'Nil', unit: '' }])
  })

  it('distinguishes an untested dipstick from a negative one', () => {
    expect(vitalsAsQuantities(reading({ urineAlbumin: null }))).toEqual([])
    expect(vitalsAsQuantities(reading({ urineAlbumin: 'NIL' }))).toHaveLength(1)
  })
})

describe('hasAnyMeasurement', () => {
  it('is false for a reading with nothing recorded', () => {
    expect(hasAnyMeasurement(reading())).toBe(false)
  })

  it('is true when a single value was taken', () => {
    expect(hasAnyMeasurement(reading({ weightKg: 58.5 }))).toBe(true)
  })

  it('is true for a recorded NIL, which is a result', () => {
    expect(hasAnyMeasurement(reading({ urineSugar: 'NIL' }))).toBe(true)
  })
})

describe('formatBloodPressure', () => {
  it('never drops the unit', () => {
    expect(formatBloodPressure({ systolicMmHg: 148, diastolicMmHg: 96 })).toBe('148/96 mmHg')
  })
})

describe('formatDipstick', () => {
  it.each([
    ['NIL', 'Nil'],
    ['TRACE', 'Trace'],
    ['ONE_PLUS', '1+'],
    ['TWO_PLUS', '2+'],
    ['THREE_PLUS', '3+'],
    ['FOUR_PLUS', '4+'],
  ] as const)('renders %s as %s', (grade, expected) => {
    expect(formatDipstick(grade)).toBe(expected)
  })
})

describe('latestVitals', () => {
  it('is null when nothing has been recorded', () => {
    expect(latestVitals([])).toBeNull()
  })

  it('picks the highest sequence number, not the array order', () => {
    const first = reading({ id: 'a', sequenceNo: 1 })
    const second = reading({ id: 'b', sequenceNo: 2 })
    expect(latestVitals([second, first])?.id).toBe('b')
  })
})

describe('bloodPressureSeries', () => {
  it('keeps both readings so a recheck is visible', () => {
    // The whole reason vitals are rows rather than columns: overwriting the
    // first reading destroys the comparison the recheck was performed to make.
    const series = bloodPressureSeries([
      reading({ id: 'a', sequenceNo: 1, bloodPressure: { systolicMmHg: 148, diastolicMmHg: 96 } }),
      reading({ id: 'b', sequenceNo: 2, bloodPressure: { systolicMmHg: 138, diastolicMmHg: 88 } }),
    ])

    expect(series.map((s) => s.bloodPressure.systolicMmHg)).toEqual([148, 138])
  })

  it('orders by sequence number regardless of input order', () => {
    const series = bloodPressureSeries([
      reading({ id: 'b', sequenceNo: 2, bloodPressure: { systolicMmHg: 138, diastolicMmHg: 88 } }),
      reading({ id: 'a', sequenceNo: 1, bloodPressure: { systolicMmHg: 148, diastolicMmHg: 96 } }),
    ])
    expect(series.map((s) => s.sequenceNo)).toEqual([1, 2])
  })

  it('skips readings that carried no blood pressure', () => {
    const series = bloodPressureSeries([
      reading({ id: 'a', sequenceNo: 1, weightKg: 58 }),
      reading({ id: 'b', sequenceNo: 2, bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80 } }),
    ])
    expect(series).toHaveLength(1)
  })
})

describe('RecordVitalsSchema', () => {
  it('accepts a single measurement', () => {
    expect(RecordVitalsSchema.safeParse({ weightKg: 58.5 }).success).toBe(true)
  })

  it('rejects a reading with nothing in it', () => {
    // A row with a timestamp and no observation reads as "vitals were taken".
    expect(RecordVitalsSchema.safeParse({}).success).toBe(false)
    expect(RecordVitalsSchema.safeParse({ note: 'patient resting' }).success).toBe(false)
  })

  it('rejects a systolic without its diastolic', () => {
    expect(RecordVitalsSchema.safeParse({ bloodPressure: { systolicMmHg: 140 } }).success).toBe(
      false,
    )
  })

  it('rejects a diastolic above the systolic', () => {
    expect(
      RecordVitalsSchema.safeParse({
        bloodPressure: { systolicMmHg: 80, diastolicMmHg: 120 },
      }).success,
    ).toBe(false)
  })

  it('accepts a clinically alarming but real reading', () => {
    // The bounds are plausibility, not judgment. A systolic of 190 must be
    // recordable; what it means is the clinician's call (PRD §3).
    expect(
      RecordVitalsSchema.safeParse({
        bloodPressure: { systolicMmHg: 190, diastolicMmHg: 120 },
        urineAlbumin: 'THREE_PLUS',
      }).success,
    ).toBe(true)
  })

  it('rejects a slipped decimal on weight', () => {
    expect(RecordVitalsSchema.safeParse({ weightKg: 5.85 }).success).toBe(false)
  })

  it('rejects an impossible pulse', () => {
    expect(RecordVitalsSchema.safeParse({ pulseBpm: 720 }).success).toBe(false)
  })

  it('accepts a recorded NIL dipstick on its own', () => {
    expect(RecordVitalsSchema.safeParse({ urineAlbumin: 'NIL' }).success).toBe(true)
  })

  it('rejects unexpected fields rather than dropping them', () => {
    expect(RecordVitalsSchema.safeParse({ weightKg: 58, bpSystolic: 120 }).success).toBe(false)
  })

  it('rejects a misspelled key inside blood pressure', () => {
    expect(
      RecordVitalsSchema.safeParse({
        bloodPressure: { systolicMmHg: 120, diastolicMmHg: 80, systolic: 130 },
      }).success,
    ).toBe(false)
  })
})
