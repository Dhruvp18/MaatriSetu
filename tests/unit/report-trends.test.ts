import { describe, expect, it } from 'vitest'

import { toTrendSeries } from '@modules/reports/report.mapper'
import {
  formatObservationValue,
  formatReferenceRange,
  isOutsidePrintedRange,
  type Observation,
  type ObservationValue,
} from '@modules/reports/report.types'

/**
 * The rule these tests exist to protect: a trend is built from every current
 * verified observation, never from the pinned subset.
 *
 * The seeded patient has three haemoglobin values (11.2 → 9.8 → 8.6) with only
 * the latest pinned. If the sparkline ever drew from pins it would show a
 * single point, the fall from 11.2 would be invisible, and the screen would
 * look entirely reasonable while hiding the finding.
 */

function observation(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    category: 'HEMATOLOGY',
    testCode: 'hb',
    testName: 'Haemoglobin',
    value: numeric(10, 'g/dL'),
    referenceRange: { kind: 'NONE' },
    observedDate: '2026-01-01',
    observedDatePrecision: 'DAY',
    source: 'EXTRACTED_VERIFIED',
    sourceUploadId: 'upload-1',
    flaggedByClinician: null,
    clinicianNote: null,
    verifiedBy: 'doctor-1',
    verifiedAt: '2026-01-01T00:00:00Z',
    isPinned: false,
    ...overrides,
  }
}

function numeric(value: number, unit: string): ObservationValue {
  return { kind: 'NUMERIC', value, unit, normalizedUnit: unit, normalizedValue: value }
}

describe('trends read from observations, not pins', () => {
  const series = [
    observation({ id: 'a', observedDate: '2026-04-01', value: numeric(11.2, 'g/dL') }),
    observation({ id: 'b', observedDate: '2026-06-30', value: numeric(9.8, 'g/dL') }),
    // Only this one is pinned, mirroring the seed.
    observation({
      id: 'c',
      observedDate: '2026-09-14',
      value: numeric(8.6, 'g/dL'),
      isPinned: true,
    }),
  ]

  it('includes every value, pinned or not', () => {
    const [trend] = toTrendSeries(series)
    expect(trend?.points.map((p) => p.value)).toEqual([11.2, 9.8, 8.6])
  })

  it('orders points oldest first so the line reads left to right', () => {
    // Deliberately shuffled: the repository returns newest first.
    const [trend] = toTrendSeries([series[2]!, series[0]!, series[1]!])
    expect(trend?.points.map((p) => p.observedDate)).toEqual([
      '2026-04-01',
      '2026-06-30',
      '2026-09-14',
    ])
  })

  it('would collapse to one point if it ever filtered on pins', () => {
    // Guards the regression directly: filtering first must change the result,
    // proving the production path is not doing it.
    const pinnedOnly = toTrendSeries(series.filter((o) => o.isPinned))
    expect(pinnedOnly[0]?.points).toHaveLength(1)
    expect(toTrendSeries(series)[0]?.points).toHaveLength(3)
  })
})

describe('series integrity', () => {
  it('separates different tests into different series', () => {
    const trends = toTrendSeries([
      observation({ id: 'a', testCode: 'hb', value: numeric(9, 'g/dL') }),
      observation({
        id: 'b',
        testCode: 'platelets',
        testName: 'Platelet count',
        value: numeric(185, '10^9/L'),
      }),
    ])

    expect(trends.map((t) => t.testCode).sort()).toEqual(['hb', 'platelets'])
  })

  it('skips text results, which have no position on a line', () => {
    const trends = toTrendSeries([
      observation({
        id: 'a',
        testCode: 'hiv',
        testName: 'HIV I & II',
        value: { kind: 'TEXT', text: 'Non-reactive' },
      }),
    ])

    expect(trends).toEqual([])
  })

  it('drops a series whose units change rather than drawing a false slope', () => {
    // 8.6 g/dL and 86 g/L are the same haemoglobin. Plotted together they look
    // like a tenfold rise.
    const trends = toTrendSeries([
      observation({ id: 'a', observedDate: '2026-01-01', value: numeric(8.6, 'g/dL') }),
      observation({ id: 'b', observedDate: '2026-02-01', value: numeric(86, 'g/L') }),
    ])

    expect(trends).toEqual([])
  })

  it('returns a single-point series rather than nothing', () => {
    // The cockpit shows the value and simply draws no line.
    const trends = toTrendSeries([observation({ id: 'a', value: numeric(9.4, 'g/dL') })])
    expect(trends[0]?.points).toHaveLength(1)
  })
})

describe('values always carry their unit', () => {
  it('renders a numeric result with its unit', () => {
    expect(formatObservationValue(numeric(8.6, 'g/dL'))).toBe('8.6 g/dL')
  })

  it('renders a text result verbatim', () => {
    expect(formatObservationValue({ kind: 'TEXT', text: 'Non-reactive' })).toBe('Non-reactive')
  })
})

describe('reference ranges are transcribed, not judged', () => {
  it('formats the shapes a slip actually prints', () => {
    expect(formatReferenceRange({ kind: 'INTERVAL', low: 11, high: 15 })).toBe('11 – 15')
    expect(formatReferenceRange({ kind: 'INTERVAL', low: null, high: 153 })).toBe('< 153')
    expect(formatReferenceRange({ kind: 'INTERVAL', low: 70, high: null })).toBe('> 70')
    expect(formatReferenceRange({ kind: 'TEXT', text: 'Non-reactive' })).toBe('Non-reactive')
    expect(formatReferenceRange({ kind: 'NONE' })).toBeNull()
  })

  it('compares against the printed interval and nothing else', () => {
    const range = { kind: 'INTERVAL', low: 11, high: 15 } as const

    expect(isOutsidePrintedRange(numeric(8.6, 'g/dL'), range)).toBe(true)
    expect(isOutsidePrintedRange(numeric(12, 'g/dL'), range)).toBe(false)
    expect(isOutsidePrintedRange(numeric(16, 'g/dL'), range)).toBe(true)
  })

  it('returns null when there is nothing to compare', () => {
    // No range printed, or a text result. The caller must show nothing rather
    // than implying a judgment the lab did not make.
    expect(isOutsidePrintedRange(numeric(8.6, 'g/dL'), { kind: 'NONE' })).toBeNull()
    expect(
      isOutsidePrintedRange(
        { kind: 'TEXT', text: 'Non-reactive' },
        { kind: 'INTERVAL', low: 1, high: 2 },
      ),
    ).toBeNull()
    expect(
      isOutsidePrintedRange(numeric(8.6, 'g/dL'), { kind: 'INTERVAL', low: null, high: null }),
    ).toBeNull()
  })
})

describe('clinician flag is tri-state', () => {
  it('keeps null distinct from false', () => {
    // null = nobody has flagged this. false = a clinician looked and did not.
    // Collapsing them would turn silence into reassurance.
    const unreviewed = observation({ id: 'a' })
    const reviewed = observation({ id: 'b', flaggedByClinician: false })

    expect(unreviewed.flaggedByClinician).toBeNull()
    expect(reviewed.flaggedByClinician).toBe(false)
    expect(unreviewed.flaggedByClinician).not.toBe(reviewed.flaggedByClinician)
  })
})
