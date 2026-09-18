import { z } from 'zod'

/**
 * Validation for everything entering the visits module from outside.
 *
 * The ranges below are *physiological plausibility* bounds, not clinical
 * judgment. They exist to catch a slipped decimal or a transposed digit at the
 * point of entry — a weight of 5.6 kg, a pulse of 720 — and they deliberately
 * accept values that are clinically alarming. A systolic of 190 is a real
 * reading that must be recordable; deciding what it means is the clinician's
 * job, and the system does not classify findings (PRD §3).
 */

export const DipstickGradeSchema = z.enum([
  'NIL', 'TRACE', 'ONE_PLUS', 'TWO_PLUS', 'THREE_PLUS', 'FOUR_PLUS',
])

export const VisitTypeSchema = z.enum(['ANC_OPD', 'FOLLOW_UP', 'EMERGENCY', 'OTHER'])

/* -------------------------------------------------------------------------- */
/* Open a visit                                                               */
/* -------------------------------------------------------------------------- */

export const OpenVisitSchema = z
  .object({
    pregnancyId: z.uuid(),
    visitType: VisitTypeSchema.default('ANC_OPD'),
  })
  .strict()

export type OpenVisitInput = z.infer<typeof OpenVisitSchema>

/* -------------------------------------------------------------------------- */
/* Record vitals                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Blood pressure: both halves together, or absent.
 *
 * A nested object rather than two sibling optionals, so "diastolic only" cannot
 * be expressed. The database CHECK enforces the same pairing; this is where the
 * nurse gets a sentence she can act on rather than a constraint violation.
 */
const BloodPressureSchema = z
  .object({
    systolicMmHg: z.number().int().min(50).max(300),
    diastolicMmHg: z.number().int().min(20).max(200),
  })
  .strict()
  .refine((bp) => bp.systolicMmHg > bp.diastolicMmHg, {
    message: 'Systolic must be higher than diastolic — check these two numbers.',
    path: ['systolicMmHg'],
  })

export const RecordVitalsSchema = z
  .object({
    bloodPressure: BloodPressureSchema.nullish(),
    pulseBpm: z.number().int().min(20).max(250).nullish(),
    respiratoryRateBpm: z.number().int().min(4).max(80).nullish(),
    temperatureC: z.number().min(30).max(45).nullish(),
    spo2Percent: z.number().int().min(50).max(100).nullish(),
    weightKg: z.number().min(20).max(250).nullish(),
    fundalHeightCm: z.number().min(5).max(50).nullish(),
    fetalHeartRateBpm: z.number().int().min(60).max(240).nullish(),
    urineAlbumin: DipstickGradeSchema.nullish(),
    urineSugar: DipstickGradeSchema.nullish(),
    note: z.string().max(1000).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // An empty reading is almost always a mis-submitted form. Storing one would
    // put a row on the chart with a timestamp and no observation, which reads
    // as "vitals were taken" — the opposite of what happened.
    const recorded = [
      value.bloodPressure,
      value.pulseBpm,
      value.respiratoryRateBpm,
      value.temperatureC,
      value.spo2Percent,
      value.weightKg,
      value.fundalHeightCm,
      value.fetalHeartRateBpm,
      value.urineAlbumin,
      value.urineSugar,
    ].some((v) => v !== null && v !== undefined)

    if (!recorded) {
      ctx.addIssue({
        code: 'custom',
        message: 'Record at least one measurement.',
      })
    }
  })

export type RecordVitalsInput = z.infer<typeof RecordVitalsSchema>

/* -------------------------------------------------------------------------- */
/* Cancel                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Cancel a visit opened in error.
 *
 * The reason is mandatory. A cancelled consultation with no explanation is
 * indistinguishable from one abandoned because the patient deteriorated, and
 * those are very different events to find in a record afterwards.
 */
export const CancelVisitSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().min(1, 'Say why this visit is being cancelled.').max(500).trim(),
  })
  .strict()

export type CancelVisitInput = z.infer<typeof CancelVisitSchema>
