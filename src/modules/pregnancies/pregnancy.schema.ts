import { z } from 'zod'

import { TERM_DAYS } from '@core/obstetrics/dating'

/**
 * Validation for everything entering the pregnancies module from outside.
 *
 * Schemas validate shape and plausibility. "Is 310 days a possible gestational
 * age" lives here. "May this actor create a pregnancy, and does she already
 * have an active one" lives in the service.
 */

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

export const DatingCertaintySchema = z.enum(['CERTAIN', 'APPROXIMATE', 'UNKNOWN'])

export const PregnancyOutcomeSchema = z.enum([
  'LIVE_BIRTH', 'STILLBIRTH', 'ABORTION_SPONTANEOUS', 'ABORTION_INDUCED',
  'ECTOPIC', 'MOLAR', 'UNKNOWN',
])

export const DeliveryModeSchema = z.enum([
  'VAGINAL', 'ASSISTED_VAGINAL', 'LSCS_EMERGENCY', 'LSCS_ELECTIVE', 'UNKNOWN',
])

export const DatePrecisionSchema = z.enum(['DAY', 'MONTH', 'YEAR', 'UNKNOWN'])

export const DataSourceSchema = z.enum([
  'CLINICIAN_ENTERED', 'STAFF_ENTERED', 'EXTRACTED_VERIFIED',
  'PATIENT_REPORTED', 'EXTERNAL_RECORD',
])

/**
 * Longest gestation this module will accept, in days.
 *
 * Matches the ceiling in `core/obstetrics/dating` and the database CHECK. A
 * value beyond this is a typo — a transposed year in an LMP, most often — and
 * accepting it would put an impossible gestational age on a handover slip.
 */
const MAX_GA_DAYS = 315

/* -------------------------------------------------------------------------- */
/* Dating input                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How this pregnancy is being dated.
 *
 * A discriminated union rather than a bag of optional fields, because the three
 * cases need genuinely different data and the invalid combinations should be
 * unrepresentable rather than merely discouraged:
 *
 *   LMP     a date she recalls; gestational age on that date is zero by
 *           definition, so no GA is accepted here — supplying one would let a
 *           caller assert an LMP that was not day zero, which is incoherent.
 *   SCAN    a scan date plus the gestational age the scan measured. This is
 *           how real practice redates, and representing it directly avoids
 *           back-calculating a fictional LMP that then circulates as though the
 *           mother had recalled it.
 *   NONE    no anchor. Explicit, not the absence of a field.
 *
 * Each branch is `.strict()` individually. Zod strips unknown keys by default,
 * and `.strict()` on an enclosing object does not reach into a nested one — so
 * without this, `{method: 'LMP', lmp: ..., gaDaysAtScan: 40}` would parse
 * happily with the gestational age silently discarded. A caller who believed
 * they had asserted a gestational age at an LMP would be wrong and never told.
 */
export const DatingInputSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('LMP'),
    lmp: CalendarDateSchema,
    certainty: DatingCertaintySchema.default('UNKNOWN'),
  }).strict(),
  z.object({
    method: z.literal('ULTRASOUND'),
    scanDate: CalendarDateSchema,
    gaDaysAtScan: z.number().int().min(0).max(MAX_GA_DAYS),
    certainty: DatingCertaintySchema.default('CERTAIN'),
  }).strict(),
  z.object({
    method: z.literal('CLINICAL_ESTIMATE'),
    assessedOn: CalendarDateSchema,
    gaDaysAtAssessment: z.number().int().min(0).max(MAX_GA_DAYS),
    // A fundal-height estimate is never CERTAIN, and defaulting it to certain
    // would launder a rough assessment into a firm date.
    certainty: z.enum(['APPROXIMATE', 'UNKNOWN']).default('APPROXIMATE'),
  }).strict(),
  z.object({
    method: z.literal('NONE'),
  }).strict(),
])

export type DatingInput = z.infer<typeof DatingInputSchema>

/* -------------------------------------------------------------------------- */
/* Obstetric history                                                          */
/* -------------------------------------------------------------------------- */

export const ObstetricHistoryInputSchema = z
  .object({
    sequenceNo: z.number().int().min(1),
    yearOfEvent: z.number().int().min(1950).max(2100).nullish(),
    eventDate: CalendarDateSchema.nullish(),
    // Most prior events are recalled to the year, sometimes the month. Storing
    // "2022" as 1 January 2022 and then computing an interval from it would
    // manufacture precision the mother never gave.
    eventDatePrecision: DatePrecisionSchema.default('YEAR'),
    outcome: PregnancyOutcomeSchema.default('UNKNOWN'),
    deliveryMode: DeliveryModeSchema.default('UNKNOWN'),
    gestationWeeksAtDelivery: z.number().int().min(16).max(45).nullish(),
    birthWeightGrams: z.number().int().min(200).max(7000).nullish(),
    childAlive: z.enum(['UNKNOWN', 'NONE_KNOWN', 'KNOWN']).default('UNKNOWN'),
    hasUterineScar: z.boolean().default(false),
    scarIndication: z.string().max(500).nullish(),
    complications: z.string().max(1000).nullish(),
    placeOfEvent: z.string().max(200).nullish(),
    source: DataSourceSchema.default('PATIENT_REPORTED'),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A caesarean leaves a scar. Recording one without the other is a
    // transcription slip, and the scar is the fact a later clinician looks for.
    const wasCaesarean =
      value.deliveryMode === 'LSCS_EMERGENCY' || value.deliveryMode === 'LSCS_ELECTIVE'

    if (wasCaesarean && !value.hasUterineScar) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasUterineScar'],
        message: 'A caesarean delivery leaves a uterine scar; record it.',
      })
    }

    if (value.yearOfEvent == null && value.eventDate == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['yearOfEvent'],
        message: 'Record at least the year of this pregnancy.',
      })
    }
  })

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GPLA. Every field optional, because "not asked" is not "zero".
 *
 * Internal consistency is checked below rather than assumed: a G2 with three
 * prior deliveries is a data-entry error, and catching it at the counter is far
 * cheaper than discovering it on a referral slip.
 */
const GravidaParitySchema = z
  .object({
    gravida: z.number().int().min(1).max(25).nullish(),
    parity: z.number().int().min(0).max(25).nullish(),
    living: z.number().int().min(0).max(25).nullish(),
    abortions: z.number().int().min(0).max(25).nullish(),
  })
  // Strict for the same reason as the dating branches: a misspelled key here
  // would be dropped in silence, and a G/P line that quietly lost a number
  // reads as a different obstetric history rather than as an error.
  .strict()

export const CreatePregnancySchema = z
  .object({
    patientId: z.uuid(),
    dating: DatingInputSchema,
    reportedLmp: CalendarDateSchema.nullish(),
    reportedLmpCertainty: DatingCertaintySchema.default('UNKNOWN'),
    gravidaParity: GravidaParitySchema.default({}),
    prePregnancyWeightKg: z.number().min(25).max(250).nullish(),
    heightCm: z.number().min(100).max(220).nullish(),
    obstetricHistory: z.array(ObstetricHistoryInputSchema).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const { gravida, parity, living, abortions } = value.gravidaParity

    // Parity counts completed pregnancies; gravida includes the current one.
    if (gravida != null && parity != null && parity > gravida - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['gravidaParity', 'parity'],
        message: 'Parity cannot exceed gravida minus the current pregnancy.',
      })
    }

    if (parity != null && living != null && living > parity) {
      ctx.addIssue({
        code: 'custom',
        path: ['gravidaParity', 'living'],
        message: 'More living children than deliveries — check these numbers.',
      })
    }

    if (gravida != null && parity != null && abortions != null && parity + abortions > gravida - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['gravidaParity', 'abortions'],
        message: 'Deliveries plus abortions exceed previous pregnancies.',
      })
    }

    // Sequence numbers index the history; duplicates make it ambiguous.
    const sequences = value.obstetricHistory.map((h) => h.sequenceNo)
    if (new Set(sequences).size !== sequences.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['obstetricHistory'],
        message: 'Each prior pregnancy needs a distinct sequence number.',
      })
    }

    // If she is dated by LMP, that LMP and the LMP recorded as reported should
    // agree — otherwise the record shows two different first days.
    if (value.dating.method === 'LMP' && value.reportedLmp != null) {
      if (value.dating.lmp !== value.reportedLmp) {
        ctx.addIssue({
          code: 'custom',
          path: ['reportedLmp'],
          message: 'The dating LMP and the reported LMP differ.',
        })
      }
    }
  })

export type CreatePregnancyInput = z.infer<typeof CreatePregnancySchema>

/* -------------------------------------------------------------------------- */
/* Redating                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Change the dating anchor on an existing pregnancy.
 *
 * Carries the version it was read at, so a concurrent change is a conflict
 * rather than a silent overwrite. A reason is mandatory: redating moves every
 * derived date on the record, and "why" is what a later reader needs.
 *
 * Note this does NOT recompute the gestational age stored on past saved visits.
 * Those are frozen snapshots of what the clinician reasoned from that day.
 */
export const UpdateDatingSchema = z
  .object({
    dating: DatingInputSchema,
    expectedVersion: z.number().int().min(1),
    reason: z.string().min(1, 'Say why the dating is being changed.').max(500).trim(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dating.method === 'NONE') {
      ctx.addIssue({
        code: 'custom',
        path: ['dating'],
        message:
          'Dating cannot be removed once established. Record a corrected anchor instead.',
      })
    }
  })

export type UpdateDatingInput = z.infer<typeof UpdateDatingSchema>

/* -------------------------------------------------------------------------- */
/* Profile — height, marriage, conception                                     */
/* -------------------------------------------------------------------------- */

/**
 * The facts about this pregnancy that are neither dating nor GPLA. Every field
 * is nullable because "not asked" is a real state; the form sends all four, so
 * clearing one is an explicit null.
 */
export const UpdatePregnancyProfileSchema = z
  .object({
    pregnancyId: z.uuid(),
    expectedVersion: z.number().int().min(1),
    heightCm: z.number().min(100, 'A height under 100 cm is almost certainly a typing slip.').max(220).nullable(),
    marriedYears: z.number().int().min(0).max(60).nullable(),
    consanguinity: z.enum(['CONSANGUINEOUS', 'NON_CONSANGUINEOUS']).nullable(),
    conceptionMode: z.enum(['NATURAL', 'IVF']).nullable(),
  })
  .strict()

export type UpdatePregnancyProfileInput = z.infer<typeof UpdatePregnancyProfileSchema>

/* -------------------------------------------------------------------------- */
/* Close                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Close an episode.
 *
 * COMPLETED requires an outcome; CLOSED_UNKNOWN is for a mother genuinely lost
 * to follow-up. The second is not a failure to record the first — a clinic that
 * cannot say what happened must be able to say exactly that, rather than being
 * pushed into recording `UNKNOWN` as though it were an outcome it observed.
 */
export const ClosePregnancySchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('COMPLETED'),
      outcome: PregnancyOutcomeSchema,
      outcomeDate: CalendarDateSchema,
      note: z.string().max(1000).nullish(),
      expectedVersion: z.number().int().min(1),
    }),
    z.object({
      status: z.literal('CLOSED_UNKNOWN'),
      note: z.string().min(1, 'Say what is known about this episode.').max(1000),
      expectedVersion: z.number().int().min(1),
    }),
  ])

export type ClosePregnancyInput = z.infer<typeof ClosePregnancySchema>

/* -------------------------------------------------------------------------- */
/* Dating input → storage                                                     */
/* -------------------------------------------------------------------------- */

/** The two columns that anchor gestational age, plus how they were arrived at. */
export interface DatingColumns {
  readonly referenceDate: string | null
  readonly referenceGaDays: number | null
  readonly method: 'LMP' | 'ULTRASOUND' | 'CLINICAL_ESTIMATE' | 'UNKNOWN'
  readonly certainty: 'CERTAIN' | 'APPROXIMATE' | 'UNKNOWN'
}

/**
 * Collapse a dating input to the reference-point pair the schema stores.
 *
 * Both methods reduce to the same two facts: a date, and how pregnant she was
 * on it. LMP is simply the case where that gestational age is zero.
 */
export function toDatingColumns(input: DatingInput): DatingColumns {
  switch (input.method) {
    case 'LMP':
      return {
        referenceDate: input.lmp,
        referenceGaDays: 0,
        method: 'LMP',
        certainty: input.certainty,
      }
    case 'ULTRASOUND':
      return {
        referenceDate: input.scanDate,
        referenceGaDays: input.gaDaysAtScan,
        method: 'ULTRASOUND',
        certainty: input.certainty,
      }
    case 'CLINICAL_ESTIMATE':
      return {
        referenceDate: input.assessedOn,
        referenceGaDays: input.gaDaysAtAssessment,
        method: 'CLINICAL_ESTIMATE',
        certainty: input.certainty,
      }
    case 'NONE':
      return {
        referenceDate: null,
        referenceGaDays: null,
        method: 'UNKNOWN',
        certainty: 'UNKNOWN',
      }
  }
}

/**
 * Whether a dating anchor implies a gestational age that is impossible today.
 *
 * Catches the transposed-year LMP: a date thirteen months ago passes the date
 * regex and the column CHECK, and only shows up as a nonsensical POG on the
 * cockpit. Checked against the clinic's today, which the service supplies.
 */
export function datingIsPlausibleOn(columns: DatingColumns, today: string): boolean {
  if (columns.referenceDate === null || columns.referenceGaDays === null) return true

  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${columns.referenceDate}T00:00:00Z`)) / 86_400_000,
  )

  // A reference date in the future is always wrong; so is one implying a
  // gestation longer than any pregnancy runs.
  if (days < 0) return false
  return columns.referenceGaDays + days <= MAX_GA_DAYS
}

/** Full term, re-exported so callers need not reach into core for it. */
export { TERM_DAYS }
