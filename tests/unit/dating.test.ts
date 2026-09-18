import { describe, expect, it } from 'vitest'

import {
  InvalidDateError,
  addDays,
  datingDiscrepancyDays,
  datingFromLmp,
  datingFromScan,
  daysBetween,
  daysUntilDue,
  estimatedDueDate,
  formatGestationalAge,
  gestationalAge,
  gestationalAgeDays,
  splitGestationalAge,
  todayIn,
  trimester,
} from '@core/obstetrics/dating'

describe('calendar primitives', () => {
  it('counts whole days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30)
    expect(daysBetween('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('crosses a leap day correctly', () => {
    // 2028 is a leap year: February has 29 days.
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29)
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28)
  })

  it('crosses a year boundary correctly', () => {
    expect(daysBetween('2025-12-25', '2026-01-05')).toBe(11)
    expect(addDays('2025-12-25', 11)).toBe('2026-01-05')
  })

  it('rejects a date that is not a real calendar day', () => {
    // The critical case: Date.UTC would silently roll this into March.
    expect(() => daysBetween('2026-02-31', '2026-03-01')).toThrow(InvalidDateError)
    expect(() => addDays('2026-13-01', 1)).toThrow(InvalidDateError)
    expect(() => addDays('26-01-01', 1)).toThrow(InvalidDateError)
  })

  it('refuses fractional day arithmetic', () => {
    expect(() => addDays('2026-01-01', 1.5)).toThrow(TypeError)
  })

  it('reports the clinic-local date, not the server-local one', () => {
    // 19:00 UTC on 17 Sep is already 18 Sep in Asia/Kolkata (UTC+5:30).
    // Getting this wrong shifts every displayed gestational age by a day for
    // an evening OPD.
    const evening = new Date('2026-09-17T19:00:00Z')
    expect(todayIn('Asia/Kolkata', evening)).toBe('2026-09-18')
    expect(todayIn('UTC', evening)).toBe('2026-09-17')
  })
})

describe('dating anchored on LMP', () => {
  const lmp = '2025-11-12'
  const dating = datingFromLmp(lmp)

  it('places gestational age at zero on the LMP itself', () => {
    expect(gestationalAgeDays(dating, lmp)).toBe(0)
  })

  it('computes the due date as LMP + 280 days', () => {
    expect(estimatedDueDate(dating)).toBe('2026-08-19')
    expect(daysBetween(lmp, estimatedDueDate(dating))).toBe(280)
  })

  it('matches the design mock: LMP 12 Nov 2025 gives EDD 19 Aug 2026', () => {
    // Cross-check against the Stitch cockpit's sample patient, which shows
    // LMP 12 Nov 2025 and EDD 19 Aug 2026.
    expect(estimatedDueDate(dating)).toBe('2026-08-19')
  })

  it('reaches 32w + 4d on 2026-06-28', () => {
    // The mock also shows POG 32W+4D. That is 228 days, which lands on
    // 28 June 2026 — not 23 June. Worth stating explicitly: the mock's POG and
    // LMP correspond to different days, so seed data must be generated from
    // the dating reference rather than copied from the design.
    const age = gestationalAge(dating, '2026-06-28')
    expect(age).toEqual({ totalDays: 228, weeks: 32, days: 4 })
    expect(formatGestationalAge(age)).toBe('32w + 4d')

    expect(gestationalAge(dating, '2026-06-23')).toEqual({
      totalDays: 223,
      weeks: 31,
      days: 6,
    })
  })

  it('advances by exactly one day per day', () => {
    const start = gestationalAgeDays(dating, '2026-06-23')
    expect(gestationalAgeDays(dating, '2026-06-24')).toBe(start + 1)
    expect(gestationalAgeDays(dating, '2026-07-23')).toBe(start + 30)
  })
})

describe('dating anchored on ultrasound', () => {
  it('treats a scan-dated pregnancy identically to an LMP-dated one', () => {
    // A scan on 2026-01-20 reporting 12w+3d (87 days).
    const dating = datingFromScan('2026-01-20', 87)

    expect(gestationalAgeDays(dating, '2026-01-20')).toBe(87)
    expect(formatGestationalAge(gestationalAge(dating, '2026-01-20'))).toBe('12w + 3d')

    // Due date is the day GA reaches 280: 193 days after the scan.
    expect(estimatedDueDate(dating)).toBe(addDays('2026-01-20', 193))
  })

  it('round-trips: dating from a scan reconstructs the same EDD as its implied LMP', () => {
    const lmpDating = datingFromLmp('2025-11-12')
    const scanDate = '2026-02-04'
    const gaAtScan = gestationalAgeDays(lmpDating, scanDate)
    const scanDating = datingFromScan(scanDate, gaAtScan)

    expect(estimatedDueDate(scanDating)).toBe(estimatedDueDate(lmpDating))
    expect(datingDiscrepancyDays(lmpDating, scanDating)).toBe(0)
  })

  it('rejects an implausible gestational age at scan', () => {
    expect(() => datingFromScan('2026-01-20', -1)).toThrow(RangeError)
    expect(() => datingFromScan('2026-01-20', 400)).toThrow(RangeError)
    expect(() => datingFromScan('2026-01-20', 87.5)).toThrow(RangeError)
  })
})

describe('gestational age formatting', () => {
  it('splits days into weeks and days', () => {
    expect(splitGestationalAge(0)).toEqual({ totalDays: 0, weeks: 0, days: 0 })
    expect(splitGestationalAge(6)).toEqual({ totalDays: 6, weeks: 0, days: 6 })
    expect(splitGestationalAge(7)).toEqual({ totalDays: 7, weeks: 1, days: 0 })
    expect(splitGestationalAge(280)).toEqual({ totalDays: 280, weeks: 40, days: 0 })
  })

  it('never renders a nonsensical age as if it were valid', () => {
    // A mistyped LMP in the future must read as an error, not as "-2w + 3d".
    expect(formatGestationalAge(-11)).toBe('Dating inconsistent')
    expect(formatGestationalAge(400)).toBe('Dating implausible')
  })
})

describe('due date and trimester', () => {
  const dating = datingFromLmp('2025-11-12')

  it('counts down to the due date and then goes negative', () => {
    expect(daysUntilDue(dating, estimatedDueDate(dating))).toBe(0)
    expect(daysUntilDue(dating, addDays(estimatedDueDate(dating), 5))).toBe(-5)
  })

  it('places trimester boundaries at 14w and 28w', () => {
    expect(trimester(0)).toBe(1)
    expect(trimester(97)).toBe(1) // 13w + 6d
    expect(trimester(98)).toBe(2) // 14w + 0d
    expect(trimester(195)).toBe(2) // 27w + 6d
    expect(trimester(196)).toBe(3) // 28w + 0d
    expect(trimester(280)).toBe(3)
  })

  it('returns null rather than guessing outside a plausible gestation', () => {
    expect(trimester(-1)).toBeNull()
    expect(trimester(400)).toBeNull()
  })
})

describe('dating discrepancy', () => {
  it('reports the difference in days without recommending anything', () => {
    const byLmp = datingFromLmp('2025-11-12')
    // A scan suggesting she is 6 days further along than her recalled LMP.
    const byScan = datingFromScan('2026-02-04', gestationalAgeDays(byLmp, '2026-02-04') + 6)

    expect(datingDiscrepancyDays(byLmp, byScan)).toBe(6)
  })
})
