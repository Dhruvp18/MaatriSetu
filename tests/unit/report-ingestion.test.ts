import { describe, expect, it } from 'vitest'

import {
  type ExtractionRunRow,
  type ReportCandidateRow,
  toExtractionState,
  toReportCandidate,
} from '@modules/reports/report.mapper'
import { CorrectCandidateSchema, UploadReportSchema } from '@modules/reports/report.schema'
import { defaultCategoryFor, isFixtureExtraction } from '@modules/reports/report.types'

/**
 * The ingestion tier, where a photograph becomes a proposal.
 *
 * Three properties are worth protecting here, and each one has a way of failing
 * that looks fine on screen:
 *
 *   A candidate with a number and no unit must not be offered for verification.
 *   "8.6" approved by a tired clinician is a haemoglobin in g/dL or in g/L
 *   depending on nothing at all.
 *
 *   "Not read yet" and "read, found nothing" must stay distinct. Collapsing
 *   them tells a clinician a slip was blank when it was merely queued, and a
 *   slip reported as blank is one nobody looks for again.
 *
 *   Fixture output must stay identifiable all the way to the verification
 *   checkbox, because that is the one place canned numbers could enter a real
 *   record.
 */

/**
 * Numeric columns are given as strings on purpose.
 *
 * PostgREST serialises `numeric` as a string to avoid the precision loss of a
 * JSON number, even though the generated row types call it `number`. The mapper
 * calls `Number()` for exactly that reason, so a fixture using real numbers
 * would test a shape the database never sends. The override type is loosened
 * rather than fought with, since that mismatch is the point.
 */
function candidateRow(overrides: Record<string, unknown> = {}): ReportCandidateRow {
  return {
    id: 'cand-1',
    clinic_id: 'clinic-1',
    extraction_run_id: 'run-1',
    test_code: 'hb',
    printed_label: 'Haemoglobin (Hb%)',
    value_numeric: '8.6',
    value_text: null,
    unit_original: 'g/dL',
    unit_normalized: 'g/dL',
    value_normalized: '8.6',
    reference_low: '11',
    reference_high: '15',
    reference_text: null,
    observed_date: '2026-09-14',
    observed_date_precision: 'DAY',
    confidence: '0.97',
    source_page: null,
    correction_version: 0,
    corrected_by: null,
    corrected_at: null,
    discarded_at: null,
    created_at: '2026-09-14T04:00:00Z',
    updated_at: '2026-09-14T04:00:00Z',
    version: 1,
    ...overrides,
  } as unknown as ReportCandidateRow
}

function runRow(overrides: Record<string, unknown> = {}): ExtractionRunRow {
  return {
    id: 'run-1',
    clinic_id: 'clinic-1',
    upload_id: 'upload-1',
    provider: 'anthropic',
    model: 'claude-opus-5',
    prompt_version: 'ocr-v1',
    status: 'READY_FOR_REVIEW',
    attempt_no: 1,
    raw_output: null,
    detected_report_type: 'CBC',
    error_code: null,
    error_message: null,
    started_at: '2026-09-14T04:00:00Z',
    completed_at: '2026-09-14T04:00:20Z',
    created_at: '2026-09-14T04:00:00Z',
    updated_at: '2026-09-14T04:00:20Z',
    version: 1,
    ...overrides,
  } as unknown as ExtractionRunRow
}

describe('a candidate carries its unit or it is not a candidate', () => {
  it('keeps the unit exactly as the slip printed it', () => {
    const candidate = toReportCandidate(
      candidateRow({ value_numeric: '1.85', unit_original: 'lakhs/cumm' }),
    )

    expect(candidate.value).toEqual({ kind: 'NUMERIC', value: 1.85, unit: 'lakhs/cumm' })
  })

  it('refuses a numeric value whose unit went missing', () => {
    expect(() =>
      toReportCandidate(candidateRow({ unit_original: null, unit_normalized: null })),
    ).toThrow(/unit/i)
  })

  it('accepts a text result, which has no unit to lose', () => {
    const candidate = toReportCandidate(
      candidateRow({
        value_numeric: null,
        unit_original: null,
        unit_normalized: null,
        value_text: 'Microcytic hypochromic picture',
      }),
    )

    expect(candidate.value).toEqual({
      kind: 'TEXT',
      text: 'Microcytic hypochromic picture',
    })
  })

  it('refuses a candidate with no value at all', () => {
    expect(() =>
      toReportCandidate(candidateRow({ value_numeric: null, value_text: null })),
    ).toThrow(/neither/i)
  })

  it('reports a null printed date as null, not as today', () => {
    expect(toReportCandidate(candidateRow({ observed_date: null })).observedDate).toBeNull()
  })
})

describe('extraction state distinguishes every way of having no values', () => {
  it('a missing run is NOT_STARTED, not an empty reading', () => {
    expect(toExtractionState(null, [])).toEqual({ status: 'NOT_STARTED' })
  })

  it('a finished run with no candidates is READY with none found', () => {
    const state = toExtractionState(runRow(), [])

    expect(state.status).toBe('READY')
    if (state.status !== 'READY') throw new Error('unreachable')
    expect(state.candidates).toHaveLength(0)
  })

  it('a queued run reads as in progress', () => {
    expect(toExtractionState(runRow({ status: 'QUEUED' }), []).status).toBe('IN_PROGRESS')
  })

  it('a failed run keeps its code so the screen can say what to do', () => {
    const state = toExtractionState(
      runRow({ status: 'FAILED', error_code: 'UNSUPPORTED_IMAGE', error_message: 'Too blurred.' }),
      [],
    )

    expect(state).toMatchObject({
      status: 'FAILED',
      errorCode: 'UNSUPPORTED_IMAGE',
      errorMessage: 'Too blurred.',
    })
  })

  it('hides discarded candidates without hiding the run', () => {
    const state = toExtractionState(runRow(), [
      candidateRow({ id: 'kept' }),
      candidateRow({ id: 'thrown-away', discarded_at: '2026-09-14T05:00:00Z' }),
    ])

    if (state.status !== 'READY') throw new Error('unreachable')
    expect(state.candidates.map((c) => c.id)).toEqual(['kept'])
  })

  it('marks fixture output so it cannot be mistaken for a real reading', () => {
    expect(isFixtureExtraction(toExtractionState(runRow({ provider: 'fixture' }), []))).toBe(true)
    expect(isFixtureExtraction(toExtractionState(runRow(), []))).toBe(false)
    // A slip nobody has read yet is not fixture output either.
    expect(isFixtureExtraction(toExtractionState(null, []))).toBe(false)
  })
})

describe('the default category classifies the test, never the finding', () => {
  it('sends a blood count to haematology', () => {
    expect(defaultCategoryFor('CBC')).toBe('HEMATOLOGY')
  })

  it('sends an unrecognised slip to OTHER rather than guessing', () => {
    expect(defaultCategoryFor('UNRECOGNISED')).toBe('OTHER')
    expect(defaultCategoryFor(null)).toBe('OTHER')
  })
})

describe('what the upload form will accept', () => {
  const base = {
    patientId: '11111111-1111-4111-8111-111111111111',
    mimeType: 'image/jpeg',
    byteSize: 1024,
  }

  it('accepts a photograph with no pregnancy, so nobody has to guess whose it is', () => {
    expect(UploadReportSchema.safeParse(base).success).toBe(true)
  })

  it('refuses a PDF, which the extraction provider cannot read', () => {
    expect(UploadReportSchema.safeParse({ ...base, mimeType: 'application/pdf' }).success).toBe(
      false,
    )
  })

  it('refuses a file larger than one photograph could reasonably be', () => {
    expect(UploadReportSchema.safeParse({ ...base, byteSize: 40 * 1024 * 1024 }).success).toBe(
      false,
    )
  })
})

describe('what a correction will accept', () => {
  it('refuses a number with no unit', () => {
    const result = CorrectCandidateSchema.safeParse({ valueNumeric: 8.6, discard: false })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.message).toMatch(/unit/i)
  })

  it('accepts a number with the unit as printed', () => {
    expect(
      CorrectCandidateSchema.safeParse({ valueNumeric: 8.6, unit: 'g/dL', discard: false }).success,
    ).toBe(true)
  })

  it('accepts a text result with no unit', () => {
    expect(
      CorrectCandidateSchema.safeParse({ valueText: 'Non-reactive', discard: false }).success,
    ).toBe(true)
  })

  it('refuses a correction that leaves nothing behind', () => {
    expect(CorrectCandidateSchema.safeParse({ discard: false }).success).toBe(false)
  })

  it('lets a discard carry the value through, so the row stays readable', () => {
    // The routine assigns rather than coalesces, so a discard has to resend
    // what was read. Validation must not stand in the way of that.
    expect(
      CorrectCandidateSchema.safeParse({
        valueNumeric: 8.6,
        unit: 'g/dL',
        discard: true,
      }).success,
    ).toBe(true)
  })
})
