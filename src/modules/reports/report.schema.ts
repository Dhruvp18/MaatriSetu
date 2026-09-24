import { z } from 'zod'

/**
 * Validation for everything entering the reports module from outside.
 *
 * Verification is not here, deliberately. Turning a candidate into an
 * observation is validated by `visits/visit.schema.ts`, because it happens
 * inside the consultation commit and nowhere else. If a `VerifySchema` ever
 * appears in this file, the guarantee that nothing enters the record outside a
 * clinician's save has been lost.
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

/* -------------------------------------------------------------------------- */
/* Ingestion                                                                  */
/* -------------------------------------------------------------------------- */

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

/**
 * What a phone camera produces, and what the extraction provider accepts.
 *
 * PDF is accepted: a lab's own printout often arrives as one, and the extraction
 * provider reads PDFs and HEIC photographs directly (core/ocr/gemini.ts).
 */
const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const

/**
 * A generous ceiling for one photograph.
 *
 * Large enough for a full-resolution phone picture of a crumpled slip, which is
 * what the reading actually depends on; small enough that a mis-selected file
 * fails at the form rather than after a minute of hospital wifi.
 */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export const UploadReportSchema = z
  .object({
    patientId: z.uuid(),
    /**
     * The episode this slip belongs to, when it is known.
     *
     * Optional, and that is the whole design. An assistant photographing a pile
     * of slips at the counter frequently cannot say whose is whose, and an
     * upload with no pregnancy can never contribute to verified history. A
     * required field here would invite a guess, which is the wrong-patient
     * error this pipeline is arranged to prevent.
     */
    pregnancyId: z.uuid().nullish(),
    /** Set when the slip is photographed during a specific consultation. */
    visitId: z.uuid().nullish(),
    mimeType: z.enum(ACCEPTED_IMAGE),
    byteSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  })
  .strict()

export type UploadReportInput = z.infer<typeof UploadReportSchema>

/**
 * Staff fixing what the model misread.
 *
 * Transcription, not verification. The routine records a correction version and
 * an actor; it does not make the value true, and no permission granted here
 * lets an assistant put anything into a patient's record.
 *
 * There is no `expectedVersion` here, unlike every other write in the system.
 * Two people fixing the same misread digit is not the dangerous race — the
 * dangerous one is a correction landing between a clinician reading a value and
 * saving it, and that is checked where it matters, inside
 * `save_visit_consultation`. A version check here would block a second
 * assistant from helping while changing nothing about what reaches the record.
 */
export const CorrectCandidateSchema = z
  .object({
    valueNumeric: z.number().nullish(),
    valueText: z.string().min(1).max(2000).nullish(),
    /** Exactly as printed on the slip. Never converted, never inferred. */
    unit: z.string().min(1).max(40).nullish(),
    observedDate: CalendarDateSchema.nullish(),
    discard: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.discard) return

    if (value.valueNumeric == null && value.valueText == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['valueNumeric'],
        message: 'A corrected value needs either a number or text. Discard it instead.',
      })
    }

    // The same rule the column CHECK enforces, stated here as a sentence a
    // person can act on. 8.6 of an unnamed thing is not a haemoglobin.
    if (value.valueNumeric != null && !value.unit) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: 'A number needs the unit printed on the slip beside it.',
      })
    }
  })

export type CorrectCandidateInput = z.infer<typeof CorrectCandidateSchema>

/**
 * Attaching an inbox slip to an episode, or quarantining a wrong-patient one.
 *
 * One schema for both, because they are the same decision reached two ways —
 * "this is hers" and "this is not hers" — and the routine audits them with the
 * previous association either way.
 */
export const AssignUploadSchema = z
  .object({
    pregnancyId: z.uuid().nullish(),
    quarantineReason: z.string().min(3).max(500).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.quarantineReason && value.pregnancyId) {
      ctx.addIssue({
        code: 'custom',
        path: ['quarantineReason'],
        message: 'A report is either attached to a pregnancy or quarantined, not both.',
      })
    }

    if (!value.quarantineReason && !value.pregnancyId) {
      ctx.addIssue({
        code: 'custom',
        path: ['pregnancyId'],
        message: 'Say which pregnancy this belongs to, or why it is being quarantined.',
      })
    }
  })

export type AssignUploadInput = z.infer<typeof AssignUploadSchema>
