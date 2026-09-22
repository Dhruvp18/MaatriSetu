/**
 * Document extraction, behind an interface.
 *
 * What comes out of here is a set of CANDIDATES, never clinical facts. The
 * two-tier model in migration 0006 exists precisely so that a model's reading
 * of a crumpled lab slip cannot become a verified observation without a
 * clinician saying so. Nothing in this module or below it may write to
 * `observations`.
 *
 * Every extracted value carries its unit as printed. A haemoglobin of 8.6 is a
 * different measurement in g/dL and in g/L, and a unitless number read off a
 * photograph is worse than no reading at all (ARCH-9).
 *
 * No domain knowledge (ARCH-3): this module knows about images and printed
 * fields, not about pregnancies.
 */

export type ExtractionReportType =
  | 'CBC' | 'OGTT' | 'SEROLOGY' | 'URINE' | 'BLOOD_GROUP' | 'THYROID'
  | 'LFT' | 'RFT' | 'HPLC' | 'ULTRASOUND' | 'OTHER' | 'UNRECOGNISED'

export interface ExtractionRequest {
  readonly image: Uint8Array
  readonly mimeType: string
  /** What kind of slip staff believe this is. A hint, never a constraint. */
  readonly expectedType?: ExtractionReportType
}

/**
 * One value the model believes it read.
 *
 * `printedLabel` is kept beside the canonical `testCode` so a clinician can see
 * what the mapping was derived from. When a slip says "Hb%" and this claims
 * `hb`, the reviewer needs both to judge whether that was right.
 */
export interface ExtractedField {
  /** Canonical code, e.g. `hb`. Null when nothing recognisable matched. */
  readonly testCode: string | null
  /** The label exactly as printed on the slip. */
  readonly printedLabel: string
  readonly valueNumeric: number | null
  readonly valueText: string | null
  /** Exactly as printed. Required whenever a numeric value is present. */
  readonly unit: string | null
  readonly referenceLow: number | null
  readonly referenceHigh: number | null
  readonly referenceText: string | null
  /**
   * Model confidence, 0..1.
   *
   * Displayed beside the field so a reviewer knows where to look hardest. It
   * never gates anything: a high-confidence misread is exactly the failure
   * mode human review exists to catch.
   */
  readonly confidence: number | null
}

export interface Extraction {
  readonly reportType: ExtractionReportType
  /** The collection or report date printed on the slip, if any. */
  readonly reportDate: string | null
  readonly fields: readonly ExtractedField[]
  readonly provider: string
  readonly model: string
  readonly promptVersion: string
  /** Verbatim provider response, kept for dispute resolution. */
  readonly raw: unknown
}

export type ExtractionResult =
  | { readonly ok: true; readonly extraction: Extraction }
  | {
      readonly ok: false
      readonly code: 'AUTH' | 'RATE_LIMIT' | 'UNSUPPORTED_IMAGE' | 'PROVIDER_ERROR' | 'TIMEOUT' | 'REFUSED'
      readonly message: string
      readonly retryable: boolean
    }

export interface OcrProvider {
  readonly name: string
  readonly model: string
  readonly promptVersion: string
  extract(request: ExtractionRequest): Promise<ExtractionResult>
}
