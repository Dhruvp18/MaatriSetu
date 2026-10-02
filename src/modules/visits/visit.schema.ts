import { z } from 'zod'

/** An ISO calendar date. A follow-up date is a calendar fact, not an instant. */
const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

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
    urineSugarMgDl: z.number().min(0).max(5000).nullish(),
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
      value.urineSugarMgDl,
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

/* -------------------------------------------------------------------------- */
/* Save & Next                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One prescription line written during the consultation.
 *
 * `.strict()` on its own, because `.strict()` on the enclosing object does not
 * reach in. Without it a misspelled `doseUnits` would be dropped in silence and
 * the order would be written with no unit at all.
 */
const PrescriptionInputSchema = z
  .object({
    medicineName: z.string().min(1).max(200).trim(),
    doseAmount: z.number().positive().max(100000).nullish(),
    doseUnit: z.string().min(1).max(32).nullish(),
    form: z.string().max(32).nullish(),
    route: z
      .enum(['ORAL', 'IV', 'IM', 'SC', 'PR', 'PV', 'TOPICAL', 'INHALED', 'OTHER'])
      .default('ORAL'),
    frequency: z.enum([
      'OD', 'BD', 'TDS', 'QID', 'HS', 'SOS', 'PRN', 'STAT', 'WEEKLY', 'OTHER',
    ]),
    foodRelation: z
      .enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'NOT_SPECIFIED'])
      .default('NOT_SPECIFIED'),
    durationDays: z.number().int().positive().max(400).nullish(),
    instructions: z.string().max(1000).nullish(),
  })
  .strict()
  .refine(
    (rx) => (rx.doseAmount == null) === (rx.doseUnit == null),
    {
      // "500" of an unnamed thing is not a dose. The column CHECK says the
      // same; this is where the clinician gets a sentence instead.
      message: 'A dose needs both an amount and a unit, or neither.',
      path: ['doseUnit'],
    },
  )

const AdviceInputSchema = z
  .object({
    dfkcCounselled: z.boolean().default(false),
    nutritionCounselled: z.boolean().default(false),
    leftLateralRest: z.boolean().default(false),
    dangerSignsCounselled: z.boolean().default(false),
    labOrders: z.array(z.string().min(1).max(200)).max(30).default([]),
    scanOrders: z.array(z.string().min(1).max(200)).max(30).default([]),
    nextFollowupDate: CalendarDateSchema.nullish(),
    additionalAdvice: z.string().max(2000).nullish(),
  })
  .strict()

/**
 * Everything the consultation commits, in one payload.
 *
 * It arrives together because it commits together. PRD §9 originally offered
 * separate pin and resolve endpoints alongside an atomic save; those writes
 * would have landed before the save and survived its failure, which is the
 * opposite of what "atomic" was promising.
 */
/**
 * One extracted value a clinician is turning into a clinical fact.
 *
 * `correctionVersion` is what the clinician actually reviewed. If an assistant
 * corrects the candidate between the review and the save, the routine rejects
 * the commit rather than storing a number nobody approved - the same
 * optimistic-concurrency reasoning as the visit version, applied per value.
 */
const VerifyCandidateSchema = z
  .object({
    candidateId: z.uuid(),
    correctionVersion: z.number().int().min(0),
    category: z.enum([
      'HEMATOLOGY', 'BIOCHEMISTRY', 'SEROLOGY', 'URINE', 'ENDOCRINE', 'OTHER',
    ]),
    testName: z.string().min(1).max(200).nullish(),
    /*
     * Clinician-entered, and tri-state on purpose: absent means nobody flagged
     * it, which is not the same as a clinician judging it unremarkable. Nothing
     * derives this from the printed reference range (PRD section 3).
     */
    flagged: z.boolean().nullish(),
    note: z.string().max(1000).nullish(),
    /** Surface it on the cockpit. A display choice, made in the same breath. */
    pin: z.boolean().default(false),
  })
  .strict()

/**
 * A reference to another doctor, committed with the consultation.
 *
 * Either a colleague at this clinic or a named external doctor. The routine
 * checks the colleague is an active member of this clinic; this is where the
 * clinician gets a sentence when neither was given.
 */
const ReferenceInputSchema = z
  .object({
    toStaffUserId: z.uuid().nullish(),
    toExternalName: z.string().trim().max(200).nullish(),
    toSpecialty: z.string().trim().max(120).nullish(),
    toFacility: z.string().trim().max(200).nullish(),
    reason: z.string().trim().min(1, 'Say why she is being referred.').max(2000),
    urgency: z.enum(['ROUTINE', 'URGENT']).default('ROUTINE'),
  })
  .strict()
  .refine((ref) => !!ref.toStaffUserId || !!ref.toExternalName, {
    message: 'Choose a doctor, or type the name of the doctor she is being referred to.',
    path: ['toExternalName'],
  })

const ChiefComplaintInputSchema = z
  .object({
    complaint: z.string().trim().min(1).max(500),
    durationValue: z.number().int().positive().max(999).nullish(),
    durationUnit: z.enum(['DAYS', 'WEEKS', 'MONTHS', 'YEARS']).nullish(),
  })
  .strict()
  .refine((c) => (c.durationValue == null) === (c.durationUnit == null), {
    message: 'A duration needs both a number and days/weeks/months/years, or neither.',
    path: ['durationUnit'],
  })

export const SaveConsultationSchema = z
  .object({
    /** Optimistic concurrency. A mismatch is a 409, never a silent overwrite. */
    expectedVersion: z.number().int().min(1),
    impression: z.string().max(10000).nullish(),
    examination: z.string().max(10000).nullish(),
    perAbdomen: z.string().max(4000).nullish(),
    perVaginum: z.string().max(4000).nullish(),
    perSpeculum: z.string().max(4000).nullish(),
    chiefComplaints: z.array(ChiefComplaintInputSchema).max(20).default([]),
    /**
     * Blood-group values, verified in this same save, that the clinician says
     * belong to her husband rather than to her. Only meaningful for candidates
     * also in `verifyCandidates`; any other id changes nothing.
     */
    husbandBloodGroupCandidateIds: z.array(z.uuid()).max(10).default([]),
    diagnosis: z.string().max(4000).nullish(),
    summary: z.string().max(10000).nullish(),
    reference: ReferenceInputSchema.nullish(),
    prescriptions: z.array(PrescriptionInputSchema).max(30).default([]),
    verifyCandidates: z.array(VerifyCandidateSchema).max(60).default([]),
    advice: AdviceInputSchema.nullish(),
    pinObservationIds: z.array(z.uuid()).max(50).default([]),
    unpinObservationIds: z.array(z.uuid()).max(50).default([]),
    resolveQueryIds: z.array(z.uuid()).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Pinning and unpinning the same finding in one save is not a preference,
    // it is a mistake — and whichever the routine applied first would decide
    // the outcome silently.
    const pinned = new Set(value.pinObservationIds)
    const clash = value.unpinObservationIds.find((id) => pinned.has(id))

    if (clash) {
      ctx.addIssue({
        code: 'custom',
        path: ['unpinObservationIds'],
        message: 'The same finding is both pinned and unpinned in this save.',
      })
    }

    // A value can only be relabelled as the husband's in the save that verifies it.
    const verifying = new Set(value.verifyCandidates.map((c) => c.candidateId))
    if (value.husbandBloodGroupCandidateIds.some((id) => !verifying.has(id))) {
      ctx.addIssue({
        code: 'custom',
        path: ['husbandBloodGroupCandidateIds'],
        message: 'Mark the report reviewed or flagged to record the husband’s blood group from it.',
      })
    }
  })

export type SaveConsultationInput = z.infer<typeof SaveConsultationSchema>
