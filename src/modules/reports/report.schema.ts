import { z } from 'zod'

/**
 * Validation for everything entering the reports module from outside.
 *
 * Read-only for now. The extraction and verification inputs — corrected
 * candidates, the pin decisions committed by Save & Next — land here when the
 * OCR pipeline and the consultation commit are built.
 */

/** Identifies a pregnancy whose results are being read. */
export const PregnancyResultsQuerySchema = z
  .object({
    pregnancyId: z.uuid(),
    /**
     * Restrict the trend to particular series.
     *
     * A filter on *presentation only*. It never restricts which observations
     * are read, because a trend built from a subset would show a different
     * slope than the record supports.
     */
    trendTestCodes: z.array(z.string().min(1).max(64)).nullish(),
  })
  .strict()

export type PregnancyResultsQuery = z.infer<typeof PregnancyResultsQuerySchema>

/**
 * Test codes the cockpit surfaces as trends by default.
 *
 * Haemoglobin first: serial values are the PRD's worked example (F7), and a
 * falling trend is the finding a two-minute consultation most often needs to
 * catch. The list is presentation, not clinical logic — nothing here decides
 * what a value means.
 */
export const DEFAULT_TREND_CODES: readonly string[] = [
  'hb',
  'platelets',
  'tsh',
]
