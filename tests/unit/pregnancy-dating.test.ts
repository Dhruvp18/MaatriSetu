import { describe, expect, it } from 'vitest'

import { formatGestationalAge } from '@core/obstetrics/dating'
import {
  DatingInputSchema,
  CreatePregnancySchema,
  UpdateDatingSchema,
  datingIsPlausibleOn,
  toDatingColumns,
} from '@modules/pregnancies/pregnancy.schema'
import {
  describeDating,
  expectedDueDate,
  gestationalAgeOn,
  priorCaesareans,
  type ObstetricHistoryEntry,
  type PregnancyDating,
} from '@modules/pregnancies/pregnancy.types'

/**
 * Dating is the number the whole cockpit hangs off. A wrong POG does not throw;
 * it renders, and it moves every milestone window the clinician is reasoning
 * about.
 */

/** The ESTABLISHED variant specifically, so tests can spread and override it. */
type EstablishedDating = Extract<PregnancyDating, { status: 'ESTABLISHED' }>

const established = (referenceDate: string, referenceGaDays: number): EstablishedDating => ({
  status: 'ESTABLISHED',
  reference: { referenceDate, referenceGaDays },
  method: 'LMP',
  certainty: 'CERTAIN',
  confirmedBy: null,
  confirmedAt: null,
})

describe('toDatingColumns', () => {
  it('stores an LMP as day zero of the anchor', () => {
    expect(toDatingColumns({ method: 'LMP', lmp: '2026-01-01', certainty: 'CERTAIN' })).toEqual({
      referenceDate: '2026-01-01',
      referenceGaDays: 0,
      method: 'LMP',
      certainty: 'CERTAIN',
    })
  })

  it('stores a scan as its own date plus the measured gestational age', () => {
    // The point of the reference-point model: redating does not require
    // inventing an LMP the mother never gave.
    expect(
      toDatingColumns({
        method: 'ULTRASOUND',
        scanDate: '2026-03-01',
        gaDaysAtScan: 84,
        certainty: 'CERTAIN',
      }),
    ).toEqual({
      referenceDate: '2026-03-01',
      referenceGaDays: 84,
      method: 'ULTRASOUND',
      certainty: 'CERTAIN',
    })
  })

  it('stores "no dating" as an explicit absence, not a zero', () => {
    expect(toDatingColumns({ method: 'NONE' })).toEqual({
      referenceDate: null,
      referenceGaDays: null,
      method: 'UNKNOWN',
      certainty: 'UNKNOWN',
    })
  })

  it('agrees between LMP dating and the equivalent scan dating', () => {
    // An LMP on 1 Jan and a scan on 1 Feb reading 31 days must describe the
    // same pregnancy. If these ever diverge the two entry paths disagree.
    const fromLmp = toDatingColumns({ method: 'LMP', lmp: '2026-01-01', certainty: 'CERTAIN' })
    const fromScan = toDatingColumns({
      method: 'ULTRASOUND',
      scanDate: '2026-02-01',
      gaDaysAtScan: 31,
      certainty: 'CERTAIN',
    })

    const on = '2026-06-01'
    const a = gestationalAgeOn(established(fromLmp.referenceDate!, fromLmp.referenceGaDays!), on)
    const b = gestationalAgeOn(established(fromScan.referenceDate!, fromScan.referenceGaDays!), on)
    expect(a?.totalDays).toBe(b?.totalDays)
  })
})

describe('gestationalAgeOn', () => {
  it('computes weeks and days from the anchor', () => {
    const age = gestationalAgeOn(established('2026-01-01', 0), '2026-09-01')
    expect(age).not.toBeNull()
    expect(formatGestationalAge(age!)).toBe('34w + 5d')
  })

  it('counts forward from a scan anchor, not from a fabricated LMP', () => {
    const age = gestationalAgeOn(established('2026-03-01', 84), '2026-03-15')
    expect(age?.totalDays).toBe(98)
  })

  it('returns null when dating is not established', () => {
    // Null, so the cockpit prints "dating not established". A zero here would
    // render as 0w + 0d, which reads as a real, very early pregnancy.
    expect(gestationalAgeOn({ status: 'NOT_ESTABLISHED' }, '2026-09-01')).toBeNull()
  })
})

describe('expectedDueDate', () => {
  it('is 280 days from an LMP anchor', () => {
    expect(expectedDueDate(established('2026-01-01', 0))).toBe('2026-10-08')
  })

  it('is null without dating, rather than a date computed from nothing', () => {
    expect(expectedDueDate({ status: 'NOT_ESTABLISHED' })).toBeNull()
  })
})

describe('describeDating', () => {
  it('names the absence explicitly', () => {
    expect(describeDating({ status: 'NOT_ESTABLISHED' })).toBe('Dating not established')
  })

  it('shows the method', () => {
    expect(describeDating(established('2026-01-01', 0))).toBe('Dated by LMP')
  })

  it('surfaces an approximate anchor as approximate', () => {
    // "Dated by LMP" and "dated by a half-remembered LMP" support different
    // decisions, so the certainty is never hidden.
    expect(
      describeDating({ ...established('2026-01-01', 0), certainty: 'APPROXIMATE' }),
    ).toBe('Dated by LMP (approximate)')
  })

  it('says so when certainty was never recorded', () => {
    expect(describeDating({ ...established('2026-01-01', 0), certainty: 'UNKNOWN' })).toBe(
      'Dated by LMP (certainty not recorded)',
    )
  })
})

describe('datingIsPlausibleOn', () => {
  const today = '2026-09-18'

  it('accepts a normal third-trimester anchor', () => {
    expect(
      datingIsPlausibleOn(
        { referenceDate: '2026-01-01', referenceGaDays: 0, method: 'LMP', certainty: 'CERTAIN' },
        today,
      ),
    ).toBe(true)
  })

  it('rejects a transposed year that implies an impossible gestation', () => {
    // 2025-01-01 passes the date regex and the column CHECK; it only shows up
    // as a nonsensical POG on the cockpit. Caught at the counter instead.
    expect(
      datingIsPlausibleOn(
        { referenceDate: '2025-01-01', referenceGaDays: 0, method: 'LMP', certainty: 'CERTAIN' },
        today,
      ),
    ).toBe(false)
  })

  it('rejects an anchor in the future', () => {
    expect(
      datingIsPlausibleOn(
        { referenceDate: '2027-01-01', referenceGaDays: 0, method: 'LMP', certainty: 'CERTAIN' },
        today,
      ),
    ).toBe(false)
  })

  it('accepts an absent anchor — there is nothing to be implausible', () => {
    expect(
      datingIsPlausibleOn(
        { referenceDate: null, referenceGaDays: null, method: 'UNKNOWN', certainty: 'UNKNOWN' },
        today,
      ),
    ).toBe(true)
  })
})

describe('DatingInputSchema', () => {
  it('will not let an LMP carry its own gestational age', () => {
    // An LMP is day zero by definition. Accepting a GA here would let a caller
    // assert an incoherent anchor.
    const result = DatingInputSchema.safeParse({
      method: 'LMP',
      lmp: '2026-01-01',
      gaDaysAtScan: 40,
    })
    expect(result.success).toBe(false)
  })

  it('refuses a clinical estimate claiming certainty', () => {
    // A fundal-height guess must not be laundered into a firm date.
    const result = DatingInputSchema.safeParse({
      method: 'CLINICAL_ESTIMATE',
      assessedOn: '2026-09-01',
      gaDaysAtAssessment: 200,
      certainty: 'CERTAIN',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a gestational age beyond any real pregnancy', () => {
    const result = DatingInputSchema.safeParse({
      method: 'ULTRASOUND',
      scanDate: '2026-09-01',
      gaDaysAtScan: 400,
    })
    expect(result.success).toBe(false)
  })
})

describe('CreatePregnancySchema', () => {
  const base = {
    patientId: '44444444-4444-4444-8444-00000000000a',
    dating: { method: 'LMP' as const, lmp: '2026-01-01', certainty: 'CERTAIN' as const },
  }

  it('accepts a minimal booking', () => {
    expect(CreatePregnancySchema.safeParse(base).success).toBe(true)
  })

  it('rejects parity that exceeds previous pregnancies', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      gravidaParity: { gravida: 2, parity: 3 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects more living children than deliveries', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      gravidaParity: { gravida: 4, parity: 2, living: 3 },
    })
    expect(result.success).toBe(false)
  })

  it('allows an unrecorded GPLA rather than forcing zeros', () => {
    // "Not asked" is not "first pregnancy".
    const result = CreatePregnancySchema.safeParse({ ...base, gravidaParity: {} })
    expect(result.success).toBe(true)
  })

  it('requires a caesarean to record its scar', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      obstetricHistory: [
        { sequenceNo: 1, yearOfEvent: 2022, deliveryMode: 'LSCS_EMERGENCY', hasUterineScar: false },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a prior pregnancy with no date at all', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      obstetricHistory: [{ sequenceNo: 1, deliveryMode: 'VAGINAL' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects duplicate sequence numbers in the history', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      obstetricHistory: [
        { sequenceNo: 1, yearOfEvent: 2020, deliveryMode: 'VAGINAL' },
        { sequenceNo: 1, yearOfEvent: 2022, deliveryMode: 'VAGINAL' },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a dating LMP that contradicts the reported LMP', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      reportedLmp: '2026-02-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unexpected fields rather than ignoring them', () => {
    const result = CreatePregnancySchema.safeParse({ ...base, edd: '2026-10-08' })
    expect(result.success).toBe(false)
  })

  it('rejects a misspelled GPLA key instead of dropping it', () => {
    // Nested objects are not covered by the outer .strict(), so each one says
    // so itself. A G/P line that silently lost a number reads as a different
    // obstetric history, not as a mistake.
    const result = CreatePregnancySchema.safeParse({
      ...base,
      gravidaParity: { gravida: 2, gravidity: 3 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a dating object carrying a field from another method', () => {
    const result = CreatePregnancySchema.safeParse({
      ...base,
      dating: { method: 'ULTRASOUND', scanDate: '2026-03-01', gaDaysAtScan: 84, lmp: '2026-01-01' },
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateDatingSchema', () => {
  const scan = {
    method: 'ULTRASOUND' as const,
    scanDate: '2026-03-01',
    gaDaysAtScan: 84,
    certainty: 'CERTAIN' as const,
  }

  it('accepts a redating with a version and a reason', () => {
    const result = UpdateDatingSchema.safeParse({
      dating: scan,
      expectedVersion: 1,
      reason: 'Redated from first-trimester scan.',
    })
    expect(result.success).toBe(true)
  })

  it('requires a reason', () => {
    // Redating moves every derived date on the record; "why" is what a later
    // reader needs.
    const result = UpdateDatingSchema.safeParse({ dating: scan, expectedVersion: 1, reason: '' })
    expect(result.success).toBe(false)
  })

  it('requires the version the caller read', () => {
    const result = UpdateDatingSchema.safeParse({ dating: scan, reason: 'Redated.' })
    expect(result.success).toBe(false)
  })

  it('refuses to remove dating once established', () => {
    const result = UpdateDatingSchema.safeParse({
      dating: { method: 'NONE' },
      expectedVersion: 1,
      reason: 'Unsure.',
    })
    expect(result.success).toBe(false)
  })
})

describe('priorCaesareans', () => {
  const entry = (
    sequenceNo: number,
    deliveryMode: ObstetricHistoryEntry['deliveryMode'],
  ): ObstetricHistoryEntry => ({
    id: `h${sequenceNo}`,
    sequenceNo,
    yearOfEvent: 2020 + sequenceNo,
    eventDate: null,
    eventDatePrecision: 'YEAR',
    outcome: 'LIVE_BIRTH',
    deliveryMode,
    gestationWeeksAtDelivery: 38,
    birthWeightGrams: 2900,
    childAlive: 'KNOWN',
    hasUterineScar: deliveryMode.startsWith('LSCS'),
    scarIndication: null,
    complications: null,
    placeOfEvent: null,
    source: 'PATIENT_REPORTED',
  })

  it('returns both kinds of caesarean and nothing else', () => {
    const history = [
      entry(1, 'VAGINAL'),
      entry(2, 'LSCS_EMERGENCY'),
      entry(3, 'LSCS_ELECTIVE'),
      entry(4, 'ASSISTED_VAGINAL'),
    ]
    expect(priorCaesareans(history).map((e) => e.sequenceNo)).toEqual([2, 3])
  })

  it('returns the entries themselves, not a count or a judgment', () => {
    // The system reports the facts and their dates. Whether the interval is
    // adequate is clinical judgment it does not make (PRD §3).
    const found = priorCaesareans([entry(1, 'LSCS_EMERGENCY')])
    expect(found[0]?.yearOfEvent).toBe(2021)
    expect(found[0]?.hasUterineScar).toBe(true)
  })

  it('is empty for a first pregnancy', () => {
    expect(priorCaesareans([])).toEqual([])
  })
})
