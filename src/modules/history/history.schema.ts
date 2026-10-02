import { z } from 'zod'

/**
 * Validation for everything entering the history module from outside.
 *
 * Ranges are plausibility bounds, not clinical judgment: they catch a slipped
 * digit (a birth weight of 24 000 g, an APGAR of 90) and nothing more.
 *
 * Every nested object is `.strict()` on its own — `.strict()` on a parent does
 * not reach into a child, and a misspelled key silently dropped from a baby's
 * record is exactly the kind of loss nobody notices until it matters.
 *
 * Lists are `nullish` on purpose. `null` means the question was not asked, and
 * `[]` means it was asked and the answer was none. The form sends one or the
 * other deliberately; the schema keeps them apart (ARCH-10).
 */

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Use a time in HH:MM form.')

const Text = (max: number) => z.string().trim().max(max)

export const HistorySourceSchema = z.enum([
  'CLINICIAN_ENTERED', 'STAFF_ENTERED', 'EXTRACTED_VERIFIED', 'PATIENT_REPORTED', 'EXTERNAL_RECORD',
])

/* -------------------------------------------------------------------------- */
/* Past obstetric history                                                     */
/* -------------------------------------------------------------------------- */

const InfantInputSchema = z
  .object({
    fetusNo: z.number().int().min(1).max(9),
    outcome: z.enum(['ALIVE', 'STILL_BIRTH', 'NEONATAL_DEATH', 'IUFD', 'CHILD_DEATH']).nullish(),
    outcomeRemarks: Text(500).nullish(),
    deliveredOn: CalendarDateSchema.nullish(),
    deliveredTime: TimeSchema.nullish(),
    birthWeightGrams: z.number().int().min(200).max(7000).nullish(),
    sex: z.enum(['MALE', 'FEMALE', 'AMBIGUOUS']).nullish(),
    apgar1Min: z.number().int().min(0).max(10).nullish(),
    apgar5Min: z.number().int().min(0).max(10).nullish(),
    apgar10Min: z.number().int().min(0).max(10).nullish(),
  })
  .strict()

export const ObstetricHistoryInputSchema = z
  .object({
    eventDate: CalendarDateSchema.nullish(),
    yearOfEvent: z.number().int().min(1950).max(2100).nullish(),
    outcome: z
      .enum([
        'LIVE_BIRTH', 'STILLBIRTH', 'ABORTION_SPONTANEOUS', 'ABORTION_INDUCED',
        'ECTOPIC', 'MOLAR', 'UNKNOWN',
      ])
      .default('UNKNOWN'),
    deliveryMode: z
      .enum(['VAGINAL', 'ASSISTED_VAGINAL', 'LSCS_EMERGENCY', 'LSCS_ELECTIVE', 'UNKNOWN'])
      .default('UNKNOWN'),
    gestationWeeksAtDelivery: z.number().int().min(16).max(45).nullish(),
    gestationCategory: z.enum(['FULL_TERM', 'PRE_TERM', 'POST_TERM', 'NONE']).nullish(),
    conceptionMode: z.enum(['NATURAL', 'IVF', 'IUI', 'OTHER']).nullish(),
    conceptionRemarks: Text(500).nullish(),
    babyPosition: Text(64).nullish(),
    inducedComplications: z
      .array(z.enum(['PRE_ECLAMPSIA', 'ECLAMPSIA', 'GESTATIONAL_DM', 'PIH', 'HYPEREMESIS']))
      .max(5)
      .nullish(),
    inducedComplicationsRemarks: Text(500).nullish(),
    relatedComplications: z
      .array(z.enum(['PLACENTA_PREVIA', 'PLACENTAL_ABRUPTION', 'ECTOPIC', 'CMV', 'HELLP']))
      .max(5)
      .nullish(),
    relatedComplicationsRemarks: Text(500).nullish(),
    plurality: z
      .enum(['SINGLE', 'TWINS', 'TRIPLETS', 'QUADRUPLETS', 'QUINTUPLETS', 'OTHER'])
      .nullish(),
    pluralityOther: Text(64).nullish(),
    hasUterineScar: z.boolean().default(false),
    scarIndication: Text(200).nullish(),
    placeOfEvent: Text(200).nullish(),
    remarks: Text(1000).nullish(),
    infants: z.array(InfantInputSchema).max(9).default([]),
    source: HistorySourceSchema.default('PATIENT_REPORTED'),
  })
  .strict()
  .superRefine((entry, ctx) => {
    const numbers = entry.infants.map((infant) => infant.fetusNo)
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: 'custom', path: ['infants'], message: 'Each baby needs its own number.' })
    }
  })

export type ObstetricHistoryInput = z.infer<typeof ObstetricHistoryInputSchema>

export const SaveObstetricHistorySchema = z
  .object({
    patientId: z.uuid(),
    /** Absent for a new entry. With it, `expectedVersion` is required. */
    historyId: z.uuid().nullish(),
    expectedVersion: z.number().int().min(1).nullish(),
    entry: ObstetricHistoryInputSchema,
  })
  .strict()
  .refine((value) => !value.historyId || value.expectedVersion != null, {
    message: 'An edit must say which version it was made against.',
    path: ['expectedVersion'],
  })

/* -------------------------------------------------------------------------- */
/* Menstrual history                                                          */
/* -------------------------------------------------------------------------- */

export const MenstrualHistoryInputSchema = z
  .object({
    lmp: CalendarDateSchema.nullish(),
    menarcheAgeYears: z.number().int().min(5).max(25).nullish(),
    durationDays: z.number().int().min(1).max(20).nullish(),
    cycleLengthDays: z.number().int().min(10).max(180).nullish(),
    cycleRegularity: z.enum(['REGULAR', 'IRREGULAR']).nullish(),
    flow: z.enum(['SCANTY', 'MODERATE', 'HEAVY']).nullish(),
    padsPerDay: z.number().int().min(0).max(30).nullish(),
    pmsEmotional: z.array(Text(64).min(1)).max(20).nullish(),
    pmsPhysical: z.array(Text(64).min(1)).max(20).nullish(),
    impactsActivities: z.boolean().nullish(),
    dysmenorrhea: z.boolean().nullish(),
    bowelBladder: z.enum(['NORMAL', 'DYSURIA', 'DYSCHEZIA', 'DYSPAREUNIA']).nullish(),
    lastPapSmearOn: CalendarDateSchema.nullish(),
    remarks: Text(1000).nullish(),
  })
  .strict()

export type MenstrualHistoryInput = z.infer<typeof MenstrualHistoryInputSchema>

export const SaveMenstrualHistorySchema = z
  .object({
    patientId: z.uuid(),
    historyId: z.uuid().nullish(),
    expectedVersion: z.number().int().min(1).nullish(),
    entry: MenstrualHistoryInputSchema,
  })
  .strict()
  .refine((value) => !value.historyId || value.expectedVersion != null, {
    message: 'An edit must say which version it was made against.',
    path: ['expectedVersion'],
  })

/* -------------------------------------------------------------------------- */
/* Immunizations                                                              */
/* -------------------------------------------------------------------------- */

export const RecordImmunizationSchema = z
  .object({
    pregnancyId: z.uuid(),
    vaccine: Text(80).min(1, 'Name the vaccine.'),
    status: z.enum(['PLANNED', 'GIVEN', 'NOT_GIVEN', 'UNKNOWN']),
    administeredOn: CalendarDateSchema.nullish(),
    facility: Text(200).nullish(),
    batchNumber: Text(64).nullish(),
    source: HistorySourceSchema.default('STAFF_ENTERED'),
  })
  .strict()
  // The database refuses a GIVEN row with no date; this is where the user gets
  // a sentence instead of a constraint name.
  .refine((value) => value.status !== 'GIVEN' || !!value.administeredOn, {
    message: 'A dose recorded as given needs the date it was given.',
    path: ['administeredOn'],
  })

/* -------------------------------------------------------------------------- */
/* Family history                                                             */
/* -------------------------------------------------------------------------- */

export const FamilyHistoryInputSchema = z
  .object({
    relation: Text(80).min(1, 'Say who in the family.'),
    vitalStatus: z.enum(['ALIVE', 'DECEASED']).default('ALIVE'),
    disease: Text(200).min(1, 'Name the disease.'),
    onsetAgeYears: z.number().int().min(0).max(120).nullish(),
    currentAgeYears: z.number().int().min(0).max(130).nullish(),
    remarks: Text(1000).nullish(),
  })
  .strict()
  .refine(
    (e) => e.onsetAgeYears == null || e.currentAgeYears == null || e.onsetAgeYears <= e.currentAgeYears,
    { message: 'The onset age cannot be after the current age.', path: ['onsetAgeYears'] },
  )

export const SaveFamilyHistorySchema = z
  .object({
    patientId: z.uuid(),
    entryId: z.uuid().nullish(),
    expectedVersion: z.number().int().min(1).nullish(),
    entry: FamilyHistoryInputSchema,
  })
  .strict()
  .refine((v) => (v.entryId == null) === (v.expectedVersion == null), {
    message: 'An edit needs the version it was read at.',
    path: ['expectedVersion'],
  })

export const RemoveFamilyHistorySchema = z
  .object({
    patientId: z.uuid(),
    entryId: z.uuid(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()

/* -------------------------------------------------------------------------- */
/* Past history                                                               */
/* -------------------------------------------------------------------------- */

export const SavePastHistorySchema = z
  .object({
    patientId: z.uuid(),
    /** Null only when none has been written yet. */
    expectedVersion: z.number().int().min(1).nullable(),
    notes: z.string().max(4000).nullable(),
  })
  .strict()

/* -------------------------------------------------------------------------- */
/* Flags                                                                      */
/* -------------------------------------------------------------------------- */

export const SetHistoryFlagSchema = z
  .object({
    patientId: z.uuid(),
    kind: z.enum(['OBSTETRIC', 'MENSTRUAL', 'FAMILY', 'PAST']),
    entryId: z.uuid(),
    flagged: z.boolean(),
  })
  .strict()
