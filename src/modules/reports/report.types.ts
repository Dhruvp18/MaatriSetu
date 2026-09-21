/**
 * Verified clinical results: laboratory observations and ultrasound reports.
 *
 * Pure TypeScript. No zod, no row shapes, no framework.
 *
 * Two shapes here carry most of the safety weight:
 *
 *   `ObservationValue` makes a unitless number unrepresentable. A haemoglobin
 *   of 8.6 means one thing in g/dL and something a factor of ten different in
 *   g/L, so the unit travels inside the value rather than beside it (ARCH-9).
 *
 *   `flaggedByClinician` is `boolean | null`, and the null is load-bearing. It
 *   means no clinician has flagged this result, which is NOT the same as a
 *   clinician having judged it normal. Nothing in this system derives that flag
 *   from a reference range — classifying a finding is clinical judgment the
 *   product does not make (PRD §3).
 */

import type { CalendarDate } from '@core/obstetrics/dating'

export type ObservationCategory =
  | 'HEMATOLOGY' | 'BIOCHEMISTRY' | 'SEROLOGY' | 'URINE' | 'ENDOCRINE' | 'OTHER'

export type DatePrecision = 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN'

export type DataSource =
  | 'CLINICIAN_ENTERED' | 'STAFF_ENTERED' | 'EXTRACTED_VERIFIED'
  | 'PATIENT_REPORTED' | 'EXTERNAL_RECORD'

export type ScanType =
  | 'DATING' | 'NT_NB' | 'TIFFA' | 'GROWTH' | 'GROWTH_DOPPLER' | 'BPP' | 'OTHER'

export type FetalPresentation =
  | 'CEPHALIC' | 'BREECH' | 'TRANSVERSE' | 'OBLIQUE' | 'UNSTABLE' | 'NOT_ASSESSED'

/**
 * A result value. Either a number with its unit, or text.
 *
 * A union rather than optional fields, so `{ value: 8.6, unit: null }` cannot
 * be constructed at all.
 */
export type ObservationValue =
  | {
      readonly kind: 'NUMERIC'
      readonly value: number
      /** Exactly as the slip printed it. */
      readonly unit: string
      /** The application's canonical unit, for trending across labs. */
      readonly normalizedUnit: string
      readonly normalizedValue: number
    }
  | { readonly kind: 'TEXT'; readonly text: string }

/**
 * The reference interval printed on the slip.
 *
 * A transcribed fact about what that laboratory considers its normal range —
 * not a judgment this system makes, and not applied to anything automatically.
 * It is shown beside the value so a clinician can see what the lab said.
 */
export type ReferenceRange =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'INTERVAL'; readonly low: number | null; readonly high: number | null }
  | { readonly kind: 'TEXT'; readonly text: string }

export interface Observation {
  readonly id: string
  readonly category: ObservationCategory
  /** Canonical code, e.g. `hb`. Trends are keyed on this. */
  readonly testCode: string
  readonly testName: string
  readonly value: ObservationValue
  readonly referenceRange: ReferenceRange
  readonly observedDate: CalendarDate
  readonly observedDatePrecision: DatePrecision
  readonly source: DataSource
  /** The document this was read from, when it came from one. */
  readonly sourceUploadId: string | null
  /** Clinician-entered. Null means nobody has flagged it — not "normal". */
  readonly flaggedByClinician: boolean | null
  readonly clinicianNote: string | null
  readonly verifiedBy: string | null
  readonly verifiedAt: string
  /** Display preference only. Never a filter for trends or history. */
  readonly isPinned: boolean
}

/** One point on a trend line. */
export interface TrendPoint {
  readonly observationId: string
  readonly observedDate: CalendarDate
  readonly value: number
  readonly unit: string
}

/**
 * A series of the same test over this pregnancy.
 *
 * Built from every current verified observation with this code — explicitly not
 * from pinned ones. If the sparkline drew from pins, an unpinned normal value
 * would vanish and the line would show a steeper fall than actually happened.
 * The seeded haemoglobin series (11.2 → 9.8 → 8.6, only the latest pinned)
 * exists to keep that honest.
 */
export interface TrendSeries {
  readonly testCode: string
  readonly testName: string
  readonly unit: string
  /** Oldest first, so the line reads left to right. */
  readonly points: readonly TrendPoint[]
}

export interface ScanReport {
  readonly id: string
  readonly scanType: ScanType
  /** The date the study was performed, not the date it reached the clinic. */
  readonly scanDate: CalendarDate
  readonly scanDatePrecision: DatePrecision
  /** Gestational age the report itself stated, in days. May differ from ours. */
  readonly gaDaysAtScan: number | null
  readonly performedAtFacility: string | null
  readonly efwGrams: number | null
  readonly efwCentile: number | null
  readonly afiCm: number | null
  readonly deepestPocketCm: number | null
  readonly presentation: FetalPresentation
  readonly placentaPosition: string | null
  readonly placentaGrade: number | null
  readonly cervicalLengthMm: number | null
  readonly fetalHeartRateBpm: number | null
  readonly umbilicalArteryPi: number | null
  readonly findings: string | null
  readonly impression: string | null
  readonly source: DataSource
  readonly sourceUploadId: string | null
  readonly verifiedBy: string | null
  readonly verifiedAt: string
  readonly isPinned: boolean
}

/** Everything the cockpit's results accordions need, in one read. */
export interface PregnancyResults {
  readonly observations: readonly Observation[]
  readonly scans: readonly ScanReport[]
  readonly trends: readonly TrendSeries[]
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** `8.6 g/dL`, or the text result. Never a bare number. */
export function formatObservationValue(value: ObservationValue): string {
  return value.kind === 'NUMERIC' ? `${value.value} ${value.unit}` : value.text
}

/** `11.0 – 15.0`, `< 153`, the printed text, or null when none was recorded. */
export function formatReferenceRange(range: ReferenceRange): string | null {
  switch (range.kind) {
    case 'NONE':
      return null
    case 'TEXT':
      return range.text
    case 'INTERVAL': {
      if (range.low !== null && range.high !== null) return `${range.low} – ${range.high}`
      if (range.high !== null) return `< ${range.high}`
      if (range.low !== null) return `> ${range.low}`
      return null
    }
  }
}

/**
 * Whether a value sits outside the range the lab printed.
 *
 * Deliberately named for what it is: a comparison against a transcribed
 * interval, not a clinical assessment. Callers must present it as "outside the
 * laboratory's stated range", never as "abnormal", and it must not drive
 * anything automatic. Returns null when there is nothing to compare.
 */
export function isOutsidePrintedRange(
  value: ObservationValue,
  range: ReferenceRange,
): boolean | null {
  if (value.kind !== 'NUMERIC' || range.kind !== 'INTERVAL') return null
  if (range.low === null && range.high === null) return null

  if (range.low !== null && value.value < range.low) return true
  if (range.high !== null && value.value > range.high) return true
  return false
}
