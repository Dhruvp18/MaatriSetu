import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'

import type {
  Observation,
  ObservationValue,
  ReferenceRange,
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

export function toReferenceRange(row: ObservationRow): ReferenceRange {
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
