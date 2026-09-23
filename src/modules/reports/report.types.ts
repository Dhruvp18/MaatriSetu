/**
 * Clinical results, and the ingestion tiers that feed them.
 *
 * The file is in two halves, and the line between them is the product's central
 * safety claim. Above it: `Observation` and `ScanReport`, verified facts that
 * appear in a patient's history. Below it: `ReportUpload` and `ReportCandidate`,
 * a photograph and a machine's reading of it, which appear nowhere until a
 * clinician says so.
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
/* Ingestion: the three tiers above `observations`                            */
/* -------------------------------------------------------------------------- */

/**
 * Nothing below this line is a clinical fact.
 *
 * `ReportUpload` is a photograph, `ReportCandidate` is a proposal, and neither
 * appears in a patient's history. They become `Observation`s only when a
 * clinician verifies them inside the consultation commit — which is why there
 * is no function anywhere in this module that turns one into the other.
 */

export type UploadAssignmentStatus = 'ASSIGNED' | 'UNASSIGNED' | 'QUARANTINED'

export type ReportType =
  | 'CBC' | 'OGTT' | 'SEROLOGY' | 'URINE' | 'BLOOD_GROUP' | 'THYROID'
  | 'LFT' | 'RFT' | 'HPLC' | 'ULTRASOUND' | 'OTHER' | 'UNRECOGNISED'

export interface ReportUpload {
  readonly id: string
  readonly patientId: string
  /** Null while the upload sits in the inbox with nobody established. */
  readonly pregnancyId: string | null
  readonly visitId: string | null
  /** Private storage key. Never a URL — see `core/storage/clinical-media`. */
  readonly objectKey: string
  readonly contentType: string
  readonly byteSize: number
  readonly assignmentStatus: UploadAssignmentStatus
  readonly quarantineReason: string | null
  readonly uploadedBy: string | null
  readonly uploadedAt: string
}

/**
 * A proposed value, as read off a photograph.
 *
 * The same `ObservationValue` union as a verified result, and for the same
 * reason: a number without its unit is not a measurement, and a candidate is
 * exactly where a misread unit would otherwise slip through. A candidate whose
 * numeric value has no unit is rejected by the mapper rather than shown.
 */
export type CandidateValue =
  | { readonly kind: 'NUMERIC'; readonly value: number; readonly unit: string }
  | { readonly kind: 'TEXT'; readonly text: string }

export interface ReportCandidate {
  readonly id: string
  /** Canonical code, or `unmapped` when nothing recognisable matched. */
  readonly testCode: string
  /** The label exactly as printed, kept so a reviewer can judge the mapping. */
  readonly printedLabel: string | null
  readonly value: CandidateValue
  readonly referenceRange: ReferenceRange
  /** The date printed on the slip. Null means the slip did not say. */
  readonly observedDate: CalendarDate | null
  /**
   * Provider confidence, 0..1.
   *
   * Shown so a reviewer knows where to look hardest. It gates nothing: a
   * confident misread is precisely what human review exists to catch.
   */
  readonly confidence: number | null
  /**
   * How many times staff have corrected this value.
   *
   * Travels with the review and back into the save, so a correction made while
   * a clinician was reading rejects the commit instead of silently storing a
   * number nobody approved.
   */
  readonly correctionVersion: number
  readonly isDiscarded: boolean
}

/**
 * What has happened to one upload, as a union rather than nullable columns.
 *
 * `NOT_STARTED` is a real state with a real meaning — the worker has not picked
 * it up yet — and it is not the same as a run that produced nothing. Modelling
 * both as "no candidates" is how a screen ends up telling a clinician a slip
 * was blank when it was merely still in the queue (ARCH-10).
 */
export type ExtractionState =
  | { readonly status: 'NOT_STARTED' }
  | {
      readonly status: 'IN_PROGRESS'
      readonly runId: string
      readonly attemptNo: number
      readonly startedAt: string | null
    }
  | {
      readonly status: 'READY'
      readonly runId: string
      readonly attemptNo: number
      readonly provider: string
      readonly model: string
      readonly promptVersion: string
      readonly reportType: ReportType | null
      readonly candidates: readonly ReportCandidate[]
    }
  | {
      readonly status: 'FAILED'
      readonly runId: string
      readonly attemptNo: number
      readonly errorCode: string
      readonly errorMessage: string | null
    }

/** One uploaded document and everything known about it. */
export interface ReportWithExtraction {
  readonly upload: ReportUpload
  readonly extraction: ExtractionState
  /**
   * When a clinician last recorded a decision on this document.
   *
   * Null means nobody has reviewed it, which is what keeps a verified slip from
   * being offered again at the next consultation.
   */
  readonly reviewedAt: string | null
}

/** True when this extraction came from canned output rather than a real read. */
export function isFixtureExtraction(state: ExtractionState): boolean {
  return state.status === 'READY' && state.provider === 'fixture'
}

/**
 * Which drawer a result from this kind of report usually belongs in.
 *
 * A starting point for the verification form, not a decision. It classifies the
 * TEST — a blood count is haematology — and never the finding, which is the
 * line PRD §3 draws: nothing here says whether a value is high, low, expected
 * or concerning. The clinician can change it before saving, and the category
 * that reaches the record is whatever they submitted.
 */
export function defaultCategoryFor(reportType: ReportType | null): ObservationCategory {
  switch (reportType) {
    case 'CBC':
    case 'HPLC':
      return 'HEMATOLOGY'
    case 'THYROID':
      return 'ENDOCRINE'
    case 'SEROLOGY':
      return 'SEROLOGY'
    case 'URINE':
      return 'URINE'
    case 'OGTT':
    case 'LFT':
    case 'RFT':
    case 'BLOOD_GROUP':
      return 'BIOCHEMISTRY'
    // ULTRASOUND, OTHER, UNRECOGNISED and null all land here. A scan's findings
    // are not observations at all, and an unrecognised slip is precisely the
    // case where guessing a category would be inventing something.
    default:
      return 'OTHER'
  }
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** `8.6 g/dL`, or the text result. Never a bare number. */
export function formatCandidateValue(value: CandidateValue): string {
  return value.kind === 'NUMERIC' ? `${value.value} ${value.unit}` : value.text
}

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
