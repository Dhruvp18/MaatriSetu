import { describe, expect, it } from 'vitest'

import {
  clinicLocalFromInstant,
  formatClinicTime,
  instantFromClinicLocal,
  InvalidLocalTimeError,
} from '@core/time/clinic-time'
import {
  describeSnapshotAllergies,
  describeSnapshotDating,
  describeUterineScar,
  formatDose,
  formatElapsed,
  formatGpla,
  transferVitalsAsQuantities,
  type SnapshotAllergies,
  type SnapshotDose,
  type SnapshotTransferVitals,
} from '@modules/referrals/referral.types'

/**
 * The arithmetic and the wording on the emergency referral slip.
 *
 * These are the two things on that document that a reader acts on directly: how
 * long ago a dose was given, and whether a blank means "no" or "nobody asked".
 * Both are pure functions, so both are tested here rather than discovered on
 * paper at 2 AM.
 */

describe('clinic-local timestamps', () => {
  it('reads a typed wall-clock time as the clinic, not the server', () => {
    // 02:14 on the ward clock in Kolkata is 20:44 the previous day in UTC. A
    // naive `new Date()` on a UTC server would record 02:14 UTC — a dose
    // timestamped five and a half hours late.
    expect(instantFromClinicLocal('2026-09-22T02:14', 'Asia/Kolkata')).toBe(
      '2026-09-21T20:44:00.000Z',
    )
  })

  it('round-trips through the clinic zone', () => {
    const instant = instantFromClinicLocal('2026-09-22T02:14', 'Asia/Kolkata')
    expect(clinicLocalFromInstant(instant, 'Asia/Kolkata')).toBe('2026-09-22T02:14')
  })

  it('handles midnight without landing a day out', () => {
    const instant = instantFromClinicLocal('2026-09-22T00:00', 'Asia/Kolkata')
    expect(clinicLocalFromInstant(instant, 'Asia/Kolkata')).toBe('2026-09-22T00:00')
    expect(formatClinicTime(instant, 'Asia/Kolkata')).toBe('00:00')
  })

  it('resolves a zone that observes daylight saving on both sides of a shift', () => {
    // London: BST in September, GMT in December. The offset is looked up at the
    // instant rather than assumed, so both round-trip.
    const summer = instantFromClinicLocal('2026-09-22T02:14', 'Europe/London')
    const winter = instantFromClinicLocal('2026-12-22T02:14', 'Europe/London')

    expect(summer).toBe('2026-09-22T01:14:00.000Z')
    expect(winter).toBe('2026-12-22T02:14:00.000Z')
    expect(clinicLocalFromInstant(summer, 'Europe/London')).toBe('2026-09-22T02:14')
    expect(clinicLocalFromInstant(winter, 'Europe/London')).toBe('2026-12-22T02:14')
  })

  it('rejects a value that is not a wall-clock time', () => {
    expect(() => instantFromClinicLocal('22/09/2026 02:14', 'Asia/Kolkata')).toThrow(
      InvalidLocalTimeError,
    )
    expect(() => instantFromClinicLocal('', 'Asia/Kolkata')).toThrow(InvalidLocalTimeError)
  })
})

describe('elapsed time since a dose', () => {
  // The most clinically active string on the slip: it decides whether the next
  // magnesium sulphate dose is due, early, or dangerous.
  const now = new Date('2026-09-22T04:00:00.000Z')

  const ago = (minutes: number) =>
    formatElapsed(new Date(now.getTime() - minutes * 60_000).toISOString(), now)

  it('reads in minutes within the first hour', () => {
    expect(ago(1)).toBe('1 min ago')
    expect(ago(35)).toBe('35 min ago')
    expect(ago(59)).toBe('59 min ago')
  })

  it('reads in hours and minutes beyond it', () => {
    expect(ago(60)).toBe('1 h ago')
    expect(ago(95)).toBe('1 h 35 min ago')
    expect(ago(240)).toBe('4 h ago')
  })

  it('collapses to days only after two of them', () => {
    expect(ago(47 * 60)).toBe('47 h ago')
    expect(ago(50 * 60)).toBe('2 days ago')
  })

  it('never rounds a dose given moments ago up into the past', () => {
    expect(ago(0)).toBe('just now')
  })

  it('flags a timestamp in the future instead of printing "0 min ago"', () => {
    // A dose that has not happened yet is a data-entry error, and showing it as
    // "just now" would invite the reader to treat the next dose as overdue.
    expect(formatElapsed('2026-09-22T06:00:00.000Z', now)).toBe(
      'timestamp is in the future — check this',
    )
  })

  it('says so when the timestamp cannot be read at all', () => {
    expect(formatElapsed('not a date', now)).toBe('time not recorded')
  })
})

describe('allergy wording', () => {
  const record = (allergies: SnapshotAllergies) => describeSnapshotAllergies(allergies)

  it('distinguishes "nobody asked" from "none"', () => {
    // The distinction this whole product exists to preserve. These two strings
    // must never converge.
    expect(record({ status: 'UNKNOWN', items: [] })).toBe(
      'Not recorded — ask before prescribing',
    )
    expect(record({ status: 'NONE_KNOWN', items: [] })).toBe('No known allergies')
  })

  it('lists substances with the reaction when one was recorded', () => {
    expect(
      record({
        status: 'KNOWN',
        items: [
          { substance: 'Penicillin', reaction: 'rash', severity: 'MODERATE' },
          { substance: 'Sulfa', reaction: null, severity: 'UNKNOWN' },
        ],
      }),
    ).toBe('Penicillin (rash), Sulfa')
  })

  it('does not read as a clean history when the detail is missing', () => {
    // KNOWN with nothing listed means an allergy exists and was not written
    // down. Rendering that as an empty list would be the worst of both.
    expect(record({ status: 'KNOWN', items: [] })).toBe(
      'Allergy recorded, detail missing — ask before prescribing',
    )
  })
})

describe('other unknowns are printed as unknowns', () => {
  it('never invents a gestational age', () => {
    expect(describeSnapshotDating({ status: 'NOT_ESTABLISHED' })).toBe('Dating not established')
    expect(
      describeSnapshotDating({
        status: 'ESTABLISHED',
        gaDays: 228,
        estimatedDueDate: '2026-11-01',
        method: 'ULTRASOUND',
        certainty: 'CERTAIN',
      }),
    ).toBe('32w + 4d')
  })

  it('separates "no scar recorded" from "no history at all"', () => {
    expect(describeUterineScar({ status: 'NO_HISTORY_RECORDED' })).toBe(
      'No obstetric history on record',
    )
    expect(describeUterineScar({ status: 'NONE_IN_RECORDED_HISTORY' })).toBe(
      'None in recorded history',
    )
    expect(describeUterineScar({ status: 'PRESENT', count: 1 })).toBe(
      '1 previous scar recorded',
    )
    expect(describeUterineScar({ status: 'PRESENT', count: 2 })).toBe(
      '2 previous scars recorded',
    )
  })

  it('dashes a parity count that was never asked, rather than zeroing it', () => {
    expect(
      formatGpla({
        dating: { status: 'NOT_ESTABLISHED' },
        gravida: 3,
        parity: 1,
        living: null,
        abortions: null,
        uterineScar: { status: 'NO_HISTORY_RECORDED' },
        priorPregnanciesOnRecord: 0,
      }),
    ).toBe('G3 P1 L– A–')
  })
})

describe('units travel with values', () => {
  it('keeps the unit on an administered dose', () => {
    const dose: SnapshotDose = {
      medicineName: 'Magnesium sulphate',
      amount: 4,
      unit: 'g',
      route: 'IV',
      administeredAt: '2026-09-22T02:25:00.000Z',
      facility: null,
      certainty: 'WITNESSED',
      note: null,
    }
    expect(formatDose(dose)).toBe('Magnesium sulphate 4 g IV')
  })

  it('emits nothing for an observation that was not taken', () => {
    const vitals: SnapshotTransferVitals = {
      status: 'RECORDED',
      recordedAt: '2026-09-22T02:14:00.000Z',
      bloodPressure: { systolicMmHg: 170, diastolicMmHg: 115 },
      pulseBpm: 104,
      respiratoryRateBpm: null,
      spo2Percent: null,
      temperatureC: null,
      urineAlbumin: 'THREE_PLUS',
      fetalHeartRateBpm: null,
    }

    // Only the four that were actually measured. A "Resp —" on the slip would
    // read as a rate that was counted and found unremarkable.
    expect(transferVitalsAsQuantities(vitals)).toEqual([
      { label: 'BP', value: '170/115', unit: 'mmHg' },
      { label: 'Pulse', value: '104', unit: 'bpm' },
      { label: 'Urine albumin', value: '3+', unit: '' },
    ])
  })

  it('produces nothing at all when no observations were recorded', () => {
    expect(transferVitalsAsQuantities({ status: 'NOT_RECORDED' })).toEqual([])
  })
})
