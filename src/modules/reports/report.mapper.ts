import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'

import type {
  CandidateValue,
  ExtractionState,
  Observation,
  ObservationValue,
  ReferenceRange,
  ReportCandidate,
  ReportUpload,
  ScanReport,
  TrendPoint,
  TrendSeries,
} from './report.types'

/**
 * Result rows, and how they become domain objects.
 *
 * Separated from the repository so the decisions below are testable without a
 * database. Two earn the separation:
 *
 *   `toValue` refuses a numeric result whose units are missing. The database
 *   CHECK makes that unreachable, but if it ever appeared, inventing a unit or
 *   dropping it silently would put an uninterpretable number on the cockpit.
 *
 *   `toTrendSeries` refuses to mix units within one series. Two laboratories
 *   reporting the same analyte in different units would otherwise produce a
 *   sparkline whose slope is an artefact of the unit change.
 */

type Tables = Database['public']['Tables']

export type ObservationRow = Tables['observations']['Row']
export type ScanReportRow = Tables['scan_reports']['Row']
export type ReportUploadRow = Tables['report_uploads']['Row']
export type ExtractionRunRow = Tables['extraction_runs']['Row']
export type ReportCandidateRow = Tables['report_candidates']['Row']

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

export function toValue(row: ObservationRow): ObservationValue {
  if (row.value_numeric !== null) {
    // `observations_numeric_has_units` guarantees both are present. Checked
    // anyway: a number whose unit went missing is not something to render.
    if (row.unit_original === null || row.unit_normalized === null) {
      throw internal(
        `Observation ${row.id} has a numeric value with no unit. A unitless clinical number cannot be displayed.`,
      )
    }

    return {
      kind: 'NUMERIC',
      value: Number(row.value_numeric),
      unit: row.unit_original,
      normalizedUnit: row.unit_normalized,
      // Normalisation is optional in the schema; fall back to the original
      // rather than to zero, which would read as a real measurement.
      normalizedValue:
        row.value_normalized !== null ? Number(row.value_normalized) : Number(row.value_numeric),
    }
  }

  if (row.value_text !== null) return { kind: 'TEXT', text: row.value_text }

  throw internal(`Observation ${row.id} has neither a numeric nor a text value.`)
}

/**
 * The interval as the slip printed it.
 *
 * Takes the columns rather than a named row type, because an observation and
 * the candidate it came from carry the identical three fields and must read
 * them identically. A reference range that changed shape on verification would
 * mean the clinician approved one thing and the record kept another.
 */
export function toReferenceRange(row: {
  reference_text: string | null
  reference_low: string | number | null
  reference_high: string | number | null
}): ReferenceRange {
  if (row.reference_text !== null) return { kind: 'TEXT', text: row.reference_text }

  if (row.reference_low !== null || row.reference_high !== null) {
    return {
      kind: 'INTERVAL',
      low: row.reference_low !== null ? Number(row.reference_low) : null,
      high: row.reference_high !== null ? Number(row.reference_high) : null,
    }
  }

  return { kind: 'NONE' }
}

/* -------------------------------------------------------------------------- */
/* Rows to domain                                                             */
/* -------------------------------------------------------------------------- */

export function toObservation(row: ObservationRow, pinnedIds: ReadonlySet<string>): Observation {
  return {
    id: row.id,
    category: row.category,
    testCode: row.test_code,
    testName: row.test_name,
    value: toValue(row),
    referenceRange: toReferenceRange(row),
    observedDate: row.observed_date,
    observedDatePrecision: row.observed_date_precision,
    source: row.source,
    sourceUploadId: row.source_upload_id,
    // Passed through exactly as stored, null included. Coercing null to false
    // here would turn "no clinician has looked at this" into "a clinician
    // judged it unremarkable".
    flaggedByClinician: row.flagged_by_clinician,
    clinicianNote: row.clinician_note,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    isPinned: pinnedIds.has(row.id),
  }
}

export function toScanReport(row: ScanReportRow, pinnedIds: ReadonlySet<string>): ScanReport {
  const n = (value: string | number | null): number | null =>
    value !== null ? Number(value) : null

  return {
    id: row.id,
    scanType: row.scan_type,
    scanDate: row.scan_date,
    scanDatePrecision: row.scan_date_precision,
    gaDaysAtScan: row.ga_days_at_scan,
    performedAtFacility: row.performed_at_facility,
    efwGrams: row.efw_grams,
    efwCentile: n(row.efw_centile),
    afiCm: n(row.afi_cm),
    deepestPocketCm: n(row.deepest_pocket_cm),
    presentation: row.presentation,
    placentaPosition: row.placenta_position,
    placentaGrade: row.placenta_grade,
    cervicalLengthMm: n(row.cervical_length_mm),
    fetalHeartRateBpm: row.fetal_heart_rate_bpm,
    umbilicalArteryPi: n(row.umbilical_artery_pi),
    findings: row.findings,
    impression: row.impression,
    source: row.source,
    sourceUploadId: row.source_upload_id,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    isPinned: pinnedIds.has(row.id),
  }
}

/* -------------------------------------------------------------------------- */
/* Ingestion rows to domain                                                   */
/* -------------------------------------------------------------------------- */

export function toReportUpload(row: ReportUploadRow): ReportUpload {
  return {
    id: row.id,
    patientId: row.patient_id,
    pregnancyId: row.pregnancy_id,
    visitId: row.visit_id,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    assignmentStatus: row.assignment_status,
    quarantineReason: row.quarantine_reason,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  }
}

/**
 * A proposed value.
 *
 * Refuses a numeric candidate with no unit, exactly as `toValue` refuses a
 * unitless observation. `report_candidates_numeric_has_units` makes it
 * unreachable, and it is checked anyway: this is the tier where a unit is most
 * likely to be lost, since it is the one a model filled in.
 */
export function toReportCandidate(row: ReportCandidateRow): ReportCandidate {
  let value: CandidateValue

  if (row.value_numeric !== null) {
    if (row.unit_original === null) {
      throw internal(
        `Candidate ${row.id} has a numeric value with no unit. It cannot be offered for verification.`,
      )
    }
    value = { kind: 'NUMERIC', value: Number(row.value_numeric), unit: row.unit_original }
  } else if (row.value_text !== null) {
    value = { kind: 'TEXT', text: row.value_text }
  } else {
    throw internal(`Candidate ${row.id} has neither a numeric nor a text value.`)
  }

  return {
    id: row.id,
    testCode: row.test_code,
    printedLabel: row.printed_label,
    value,
    referenceRange: toReferenceRange(row),
    observedDate: row.observed_date,
    confidence: row.confidence !== null ? Number(row.confidence) : null,
    correctionVersion: row.correction_version,
    isDiscarded: row.discarded_at !== null,
  }
}

/**
 * What state an upload's extraction is in.
 *
 * `null` for the run means the worker has not reached it — a distinct state
 * from a run that finished with nothing, and rendered as a distinct sentence.
 *
 * `QUEUED` and `NEEDS_CORRECTION` both collapse into IN_PROGRESS here. Neither
 * is something a reviewer can act on, and offering two flavours of "wait" on a
 * consultation screen is noise at eighty patients a shift.
 */
export function toExtractionState(
  run: ExtractionRunRow | null,
  candidates: readonly ReportCandidateRow[],
): ExtractionState {
  if (run === null) return { status: 'NOT_STARTED' }

  if (run.status === 'FAILED') {
    return {
      status: 'FAILED',
      runId: run.id,
      attemptNo: run.attempt_no,
      // `extraction_runs_failure_explained` guarantees a code exists. The
      // fallback keeps a screen from rendering "undefined" if it ever does not.
      errorCode: run.error_code ?? 'UNKNOWN',
      errorMessage: run.error_message,
    }
  }

  if (run.status !== 'READY_FOR_REVIEW') {
    return {
      status: 'IN_PROGRESS',
      runId: run.id,
      attemptNo: run.attempt_no,
      startedAt: run.started_at,
    }
  }

  return {
    status: 'READY',
    runId: run.id,
    attemptNo: run.attempt_no,
    provider: run.provider,
    model: run.model,
    promptVersion: run.prompt_version,
    reportType: run.detected_report_type,
    // Discarded rows are dropped here rather than in the query, so that a
    // repository reading candidates for any other purpose still sees them.
    candidates: candidates.filter((row) => row.discarded_at === null).map(toReportCandidate),
  }
}

/* -------------------------------------------------------------------------- */
/* Trends                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Group observations into one series per test code.
 *
 * The input is every current verified observation for the pregnancy — not the
 * pinned ones. That is the entire point of the separation between
 * `observations` and `finding_pins`.
 *
 * Text results are skipped: "Non-reactive" has no position on a line. A series
 * with fewer than two points is still returned, because the cockpit shows the
 * single value and simply draws no line.
 */
export function toTrendSeries(observations: readonly Observation[]): TrendSeries[] {
  const grouped = new Map<string, Observation[]>()

  for (const observation of observations) {
    if (observation.value.kind !== 'NUMERIC') continue
    const existing = grouped.get(observation.testCode)
    if (existing) existing.push(observation)
    else grouped.set(observation.testCode, [observation])
  }

  const series: TrendSeries[] = []

  for (const [testCode, group] of grouped) {
    // Oldest first, so the line reads left to right.
    const ordered = [...group].sort((a, b) => a.observedDate.localeCompare(b.observedDate))

    const units = new Set(
      ordered.map((o) => (o.value.kind === 'NUMERIC' ? o.value.normalizedUnit : '')),
    )

    // A series whose units change mid-way would draw a slope that is an
    // artefact of the unit, not of the patient. Rather than render something
    // misleading, drop it — the individual values still appear in the table.
    if (units.size !== 1) continue

    const points: TrendPoint[] = ordered.map((o) => {
      if (o.value.kind !== 'NUMERIC') throw internal('Non-numeric observation reached a trend.')
      return {
        observationId: o.id,
        observedDate: o.observedDate,
        value: o.value.normalizedValue,
        unit: o.value.normalizedUnit,
      }
    })

    const first = ordered[0]
    const firstPoint = points[0]
    if (!first || !firstPoint) continue

    series.push({
      testCode,
      testName: first.testName,
      unit: firstPoint.unit,
      points,
    })
  }

  return series
}
