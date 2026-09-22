import { z } from 'zod'

/**
 * Validation for everything entering and leaving the referrals module.
 *
 * Two different jobs live here, and they have opposite defaults.
 *
 *   INPUT schemas are `.strict()`, including every nested object — zod strips
 *   unknown keys silently and `.strict()` does not reach inside, which has
 *   already cost this codebase one real bug. A misspelled `systolic_mmHg`
 *   dropping out of a transfer BP would put a slip in a receiving unit's hands
 *   with no blood pressure on it and no error anywhere.
 *
 *   The SNAPSHOT schema is deliberately NOT strict. It parses a document that
 *   may have been frozen by an older or newer build, and the point of
 *   `schemaVersion` is that a field added later must not stop an older slip
 *   from rendering. Unknown keys are dropped; missing required ones still fail
 *   loudly, which is the failure worth having.
 *
 * Ranges below are physiological plausibility bounds, not clinical judgment.
 * They catch a slipped decimal at the point of entry and deliberately accept
 * values that are alarming: a systolic of 190 on a referral is exactly the
 * reading this feature exists to transmit.
 */

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

const Instant = z.iso.datetime({ offset: true })

const DipstickGradeSchema = z.enum([
  'NIL', 'TRACE', 'ONE_PLUS', 'TWO_PLUS', 'THREE_PLUS', 'FOUR_PLUS',
])

const MembraneStatusSchema = z.enum(['INTACT', 'RUPTURED', 'NOT_ASSESSED'])

const MedicationRouteSchema = z.enum([
  'ORAL', 'IV', 'IM', 'SC', 'PR', 'PV', 'TOPICAL', 'INHALED', 'OTHER',
])

const AdministrationCertaintySchema = z.enum([
  'WITNESSED', 'DOCUMENTED', 'PATIENT_REPORTED', 'UNCERTAIN',
])

const BloodGroupSchema = z.enum([
  'A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG',
])

const DataSourceSchema = z.enum([
  'CLINICIAN_ENTERED', 'STAFF_ENTERED', 'EXTRACTED_VERIFIED',
  'PATIENT_REPORTED', 'EXTERNAL_RECORD',
])

/**
 * Blood pressure: both halves together, or absent.
 *
 * Nested object rather than two sibling optionals, so "diastolic only" cannot
 * be expressed. The column CHECK in 0010 enforces the same pairing; this is
 * where the clinician gets a sentence instead of a constraint violation.
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

/* -------------------------------------------------------------------------- */
/* Starting a draft                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately short.
 *
 * A referral is started while someone is deteriorating. The two facts that are
 * always known at that moment are who she is and why she is going; everything
 * else is filled in as the transfer is arranged. Demanding a receiving facility
 * here would mean holding the record open in someone's head while they find a
 * phone number.
 */
export const CreateReferralDraftSchema = z
  .object({
    pregnancyId: z.uuid(),
    /** Present only when the referral arose inside a consultation. Usually not. */
    originVisitId: z.uuid().nullish(),
    /**
     * The issued referral this one corrects. An issued document is never
     * edited; a correction is a new referral that supersedes the old one.
     */
    supersedesId: z.uuid().nullish(),
    indication: z.string().max(2000).trim().nullish(),
    receivingFacility: z.string().max(300).trim().nullish(),
  })
  .strict()

export type CreateReferralDraftInput = z.infer<typeof CreateReferralDraftSchema>

/* -------------------------------------------------------------------------- */
/* Editing a draft                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Transfer observations, with the time they were taken.
 *
 * `recordedAt` is required whenever anything was measured, and that is the
 * whole reason this is a nested object rather than seven loose fields. A BP on
 * a handover slip with no time attached cannot be acted on: the receiving unit
 * cannot tell whether it is the reading on arrival or one from four hours ago.
 */
const TransferVitalsSchema = z
  .object({
    recordedAt: Instant,
    bloodPressure: BloodPressureSchema.nullish(),
    pulseBpm: z.number().int().min(20).max(250).nullish(),
    respiratoryRateBpm: z.number().int().min(4).max(80).nullish(),
    spo2Percent: z.number().int().min(50).max(100).nullish(),
    temperatureC: z.number().min(30).max(45).nullish(),
    urineAlbumin: DipstickGradeSchema.nullish(),
    fetalHeartRateBpm: z.number().int().min(60).max(240).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const measured = [
      value.bloodPressure,
      value.pulseBpm,
      value.respiratoryRateBpm,
      value.spo2Percent,
      value.temperatureC,
      value.urineAlbumin,
      value.fetalHeartRateBpm,
    ].some((v) => v !== null && v !== undefined)

    if (!measured) {
      // A timestamp with no reading behind it prints as "vitals taken at
      // 02:14" on the slip. Nothing was taken.
      ctx.addIssue({
        code: 'custom',
        message: 'Record at least one transfer observation, or leave this section empty.',
      })
    }
  })

/** A vaginal examination, with the time it was performed. Same rule as vitals. */
const ExaminationSchema = z
  .object({
    examinedAt: Instant,
    dilatationCm: z.number().min(0).max(10).nullish(),
    effacementPercent: z.number().int().min(0).max(100).nullish(),
    station: z.string().max(20).trim().nullish(),
    membranes: MembraneStatusSchema.default('NOT_ASSESSED'),
    liquor: z.string().max(200).trim().nullish(),
  })
  .strict()

/**
 * The whole draft, every time.
 *
 * A replace rather than a patch. With a patch, an omitted field is ambiguous —
 * "leave it alone" or "clear it" — and on this document the difference can be a
 * cleared allergy note. The form posts everything it is showing, so what was
 * sent is what the document says.
 */
export const UpdateReferralDraftSchema = z
  .object({
    /** Optimistic concurrency. A mismatch is a 409, never a silent overwrite. */
    expectedVersion: z.number().int().min(1),

    referringFacility: z.string().max(300).trim().nullish(),
    referringDoctorName: z.string().max(200).trim().nullish(),
    referringContactPhone: z.string().max(32).trim().nullish(),
    receivingFacility: z.string().max(300).trim().nullish(),
    receivingContact: z.string().max(300).trim().nullish(),
    transportMode: z.string().max(120).trim().nullish(),
    departureAt: Instant.nullish(),

    indication: z.string().max(2000).trim().nullish(),
    clinicalSummary: z.string().max(10000).trim().nullish(),

    transferVitals: TransferVitalsSchema.nullish(),
    examination: ExaminationSchema.nullish(),

    linesAndCatheters: z.string().max(1000).trim().nullish(),
    accompanyingStaff: z.string().max(300).trim().nullish(),
  })
  .strict()

export type UpdateReferralDraftInput = z.infer<typeof UpdateReferralDraftSchema>

/* -------------------------------------------------------------------------- */
/* Issuing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Issue freezes the document.
 *
 * Only the version travels: everything that goes on the slip is read from the
 * record inside the issuing transaction, so there is no window in which the
 * clinician's screen and the frozen document could describe different states.
 * Sending the fields again would reopen exactly that window.
 */
export const IssueReferralSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
  })
  .strict()

export type IssueReferralInput = z.infer<typeof IssueReferralSchema>

/* -------------------------------------------------------------------------- */
/* Access links                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A link to an issued referral.
 *
 * The lower bound stops a link expiring before the ambulance arrives; the upper
 * bound stops a handover link quietly becoming a permanent record-sharing URL
 * that nobody remembers granting. The routine in 0021 enforces the same range,
 * because this one is advice and that one is the rule.
 *
 * No default here. When it is omitted the service uses the deployment's
 * configured `REFERRAL_TOKEN_TTL_HOURS`, which is where a clinic's answer to
 * "how long should a handover link live" belongs — not in a constant.
 */
export const CreateReferralLinkSchema = z
  .object({
    ttlMinutes: z
      .number()
      .int()
      .min(15, 'A link shorter than 15 minutes will expire before it is opened.')
      .max(10080, 'A handover link may not outlive a week.')
      .optional(),
  })
  .strict()

export type CreateReferralLinkInput = z.infer<typeof CreateReferralLinkSchema>

export const RevokeReferralLinkSchema = z
  .object({
    tokenId: z.uuid(),
    reason: z.string().max(500).trim().nullish(),
  })
  .strict()

export type RevokeReferralLinkInput = z.infer<typeof RevokeReferralLinkSchema>

/* -------------------------------------------------------------------------- */
/* The frozen document, on the way back out                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parsing the snapshot rather than casting it.
 *
 * The column is `jsonb`, so it reaches this process as `unknown` however it was
 * written. Casting it would mean a snapshot frozen by an older build renders as
 * `undefined` in the middle of a clinical field, on the one page in this system
 * nobody can ask a question about. Parsing makes that a loud failure here
 * instead (ARCH-6).
 */

const SnapshotAgeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('UNKNOWN') }),
  z.object({
    status: z.literal('KNOWN'),
    years: z.number().int(),
    basis: z.enum(['DATE_OF_BIRTH', 'STATED']),
  }),
])

const SnapshotBloodGroupSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NOT_RECORDED') }),
  z.object({
    status: z.literal('KNOWN'),
    value: BloodGroupSchema,
    source: DataSourceSchema,
    recordedOn: z.string().nullable(),
  }),
])

const SnapshotAllergiesSchema = z.object({
  status: z.enum(['UNKNOWN', 'NONE_KNOWN', 'KNOWN']),
  items: z.array(
    z.object({
      substance: z.string(),
      reaction: z.string().nullable(),
      severity: z.enum(['UNKNOWN', 'MILD', 'MODERATE', 'SEVERE']),
    }),
  ),
})

const SnapshotDatingSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NOT_ESTABLISHED') }),
  z.object({
    status: z.literal('ESTABLISHED'),
    gaDays: z.number().int(),
    estimatedDueDate: z.string(),
    method: z.string(),
    certainty: z.string(),
  }),
])

const SnapshotUterineScarSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NO_HISTORY_RECORDED') }),
  z.object({ status: z.literal('NONE_IN_RECORDED_HISTORY') }),
  z.object({ status: z.literal('PRESENT'), count: z.number().int() }),
])

const SnapshotTransferVitalsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NOT_RECORDED') }),
  z.object({
    status: z.literal('RECORDED'),
    recordedAt: z.string(),
    bloodPressure: z
      .object({ systolicMmHg: z.number(), diastolicMmHg: z.number() })
      .nullable(),
    pulseBpm: z.number().nullable(),
    respiratoryRateBpm: z.number().nullable(),
    spo2Percent: z.number().nullable(),
    temperatureC: z.coerce.number().nullable(),
    urineAlbumin: DipstickGradeSchema.nullable(),
    fetalHeartRateBpm: z.number().nullable(),
  }),
])

const SnapshotExaminationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('NOT_PERFORMED') }),
  z.object({
    status: z.literal('PERFORMED'),
    examinedAt: z.string(),
    examinedBy: z.string().nullable(),
    // Postgres `numeric` can arrive as a string through PostgREST; coerced so a
    // dilatation never reaches a renderer as "4.0" where a number is expected.
    dilatationCm: z.coerce.number().nullable(),
    effacementPercent: z.number().nullable(),
    station: z.string().nullable(),
    membranes: MembraneStatusSchema,
    liquor: z.string().nullable(),
  }),
])

const SnapshotDoseSchema = z.object({
  medicineName: z.string(),
  amount: z.coerce.number(),
  unit: z.string(),
  route: MedicationRouteSchema,
  /** Mandatory by the table's definition, and mandatory here for the same reason. */
  administeredAt: z.string(),
  facility: z.string().nullable(),
  certainty: AdministrationCertaintySchema,
  note: z.string().nullable(),
})

const SnapshotResultSchema = z.object({
  testName: z.string(),
  category: z.string(),
  valueNumeric: z.coerce.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().nullable(),
  observedDate: z.string(),
  observedDatePrecision: z.string(),
  source: DataSourceSchema,
  clinicianNote: z.string().nullable(),
})

const SnapshotFacilitySchema = z.object({
  name: z.string(),
  address: z.string().nullish(),
  phone: z.string().nullish(),
  doctorName: z.string().nullish(),
  contact: z.string().nullish(),
})

export const ReferralSnapshotSchema = z.object({
  schemaVersion: z.number().int(),
  issuedAt: z.string(),
  asOfDate: z.string(),
  timeZone: z.string().min(1),
  issuedBy: z.object({ name: z.string(), registrationNo: z.string().nullable() }),
  referringFacility: SnapshotFacilitySchema,
  receivingFacility: SnapshotFacilitySchema,
  transfer: z.object({
    mode: z.string().nullable(),
    departureAt: z.string().nullable(),
    accompanyingStaff: z.string().nullable(),
    linesAndCatheters: z.string().nullable(),
  }),
  patient: z.object({
    uhid: z.string(),
    fullName: z.string(),
    age: SnapshotAgeSchema,
    bloodGroup: SnapshotBloodGroupSchema,
    allergies: SnapshotAllergiesSchema,
  }),
  pregnancy: z.object({
    dating: SnapshotDatingSchema,
    gravida: z.number().int().nullable(),
    parity: z.number().int().nullable(),
    living: z.number().int().nullable(),
    abortions: z.number().int().nullable(),
    uterineScar: SnapshotUterineScarSchema,
    priorPregnanciesOnRecord: z.number().int(),
  }),
  transferVitals: SnapshotTransferVitalsSchema,
  examination: SnapshotExaminationSchema,
  preReferralDoses: z.array(SnapshotDoseSchema),
  recentResults: z.array(SnapshotResultSchema),
  // An issued referral cannot exist without one; the routine refuses to freeze
  // a document that does not say why the patient is being moved.
  indication: z.string(),
  clinicalSummary: z.string().nullable(),
  supersedesReferralId: z.string().nullable(),
})
