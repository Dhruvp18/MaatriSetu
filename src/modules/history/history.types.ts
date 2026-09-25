/**
 * A woman's recorded history: prior pregnancies in detail, menstrual history,
 * and immunizations.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework.
 *
 * Everything here is history as told or as documented — never a finding this
 * system produced. The labels below are the paper OPD form's own wording, and
 * none of them is derived from anything else on the record (PRD §3).
 *
 * `RecordedList` carries the one distinction this file exists to protect: a
 * complication list nobody asked about is not the same as one where the answer
 * was "none" (ARCH-10). Rendering the first as the second tells the next
 * clinician a question was answered that never was.
 */

import type { CalendarDate } from '@core/obstetrics/dating'

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/** A list that was asked about, or not. An empty RECORDED list is "none". */
export type RecordedList<T> =
  | { readonly kind: 'NOT_RECORDED' }
  | { readonly kind: 'RECORDED'; readonly items: readonly T[] }

/** Yes, no, or never asked. */
export type YesNo = 'YES' | 'NO' | 'NOT_RECORDED'

export type HistorySource =
  | 'CLINICIAN_ENTERED' | 'STAFF_ENTERED' | 'EXTRACTED_VERIFIED'
  | 'PATIENT_REPORTED' | 'EXTERNAL_RECORD'

/* -------------------------------------------------------------------------- */
/* Past obstetric history                                                     */
/* -------------------------------------------------------------------------- */

export type ConceptionMode = 'NATURAL' | 'IVF' | 'IUI' | 'OTHER'

export type GestationCategory = 'FULL_TERM' | 'PRE_TERM' | 'POST_TERM' | 'NONE'

export type InducedComplication =
  | 'PRE_ECLAMPSIA' | 'ECLAMPSIA' | 'GESTATIONAL_DM' | 'PIH' | 'HYPEREMESIS'

export type RelatedComplication =
  | 'PLACENTA_PREVIA' | 'PLACENTAL_ABRUPTION' | 'ECTOPIC' | 'CMV' | 'HELLP'

export type Plurality = 'SINGLE' | 'TWINS' | 'TRIPLETS' | 'QUADRUPLETS' | 'QUINTUPLETS' | 'OTHER'

export type InfantOutcome = 'ALIVE' | 'STILL_BIRTH' | 'NEONATAL_DEATH' | 'IUFD' | 'CHILD_DEATH'

export type InfantSex = 'MALE' | 'FEMALE' | 'AMBIGUOUS'

export type PriorOutcome =
  | 'LIVE_BIRTH' | 'STILLBIRTH' | 'ABORTION_SPONTANEOUS' | 'ABORTION_INDUCED'
  | 'ECTOPIC' | 'MOLAR' | 'UNKNOWN'

export type DeliveryMode =
  | 'VAGINAL' | 'ASSISTED_VAGINAL' | 'LSCS_EMERGENCY' | 'LSCS_ELECTIVE' | 'UNKNOWN'

/** One baby of a prior pregnancy. Twins are two of these, not one. */
export interface InfantRecord {
  readonly fetusNo: number
  readonly outcome: InfantOutcome | null
  readonly outcomeRemarks: string | null
  readonly deliveredOn: CalendarDate | null
  /** `HH:MM`, wall-clock, as recalled or printed. */
  readonly deliveredTime: string | null
  readonly birthWeightGrams: number | null
  readonly sex: InfantSex | null
  readonly apgar1Min: number | null
  readonly apgar5Min: number | null
  readonly apgar10Min: number | null
}

/** A prior pregnancy, as the OPD form records it. */
export interface ObstetricHistoryRecord {
  readonly id: string
  /** Gravida number: 1 is her first pregnancy. */
  readonly sequenceNo: number
  readonly version: number
  readonly eventDate: CalendarDate | null
  readonly yearOfEvent: number | null
  readonly outcome: PriorOutcome
  readonly deliveryMode: DeliveryMode
  readonly gestationWeeksAtDelivery: number | null
  readonly gestationCategory: GestationCategory | null
  readonly conceptionMode: ConceptionMode | null
  readonly conceptionRemarks: string | null
  readonly babyPosition: string | null
  readonly inducedComplications: RecordedList<InducedComplication>
  readonly inducedComplicationsRemarks: string | null
  readonly relatedComplications: RecordedList<RelatedComplication>
  readonly relatedComplicationsRemarks: string | null
  readonly plurality: Plurality | null
  readonly pluralityOther: string | null
  /** A recorded fact, never inferred from the delivery mode by this system. */
  readonly hasUterineScar: boolean
  readonly scarIndication: string | null
  readonly placeOfEvent: string | null
  readonly remarks: string | null
  readonly infants: readonly InfantRecord[]
  readonly source: HistorySource
  readonly recordedAt: string
}

/* -------------------------------------------------------------------------- */
/* Menstrual history                                                          */
/* -------------------------------------------------------------------------- */

export type CycleRegularity = 'REGULAR' | 'IRREGULAR'

export type BowelBladder = 'NORMAL' | 'DYSURIA' | 'DYSCHEZIA' | 'DYSPAREUNIA'

export const BOWEL_BLADDER_LABELS: Record<BowelBladder, string> = {
  NORMAL: 'Normal',
  DYSURIA: 'Dysuria',
  DYSCHEZIA: 'Dyschezia',
  DYSPAREUNIA: 'Dyspareunia',
}

export type MenstrualFlow = 'SCANTY' | 'MODERATE' | 'HEAVY'

export interface MenstrualHistoryRecord {
  readonly id: string
  readonly version: number
  /** The day this history was taken, which is what the list is keyed by. */
  readonly recordedOn: CalendarDate
  readonly lmp: CalendarDate | null
  readonly menarcheAgeYears: number | null
  readonly durationDays: number | null
  readonly cycleLengthDays: number | null
  readonly cycleRegularity: CycleRegularity | null
  readonly flow: MenstrualFlow | null
  readonly padsPerDay: number | null
  readonly pmsEmotional: RecordedList<string>
  readonly pmsPhysical: RecordedList<string>
  readonly impactsActivities: YesNo
  readonly dysmenorrhea: YesNo
  readonly bowelBladder: BowelBladder | null
  readonly lastPapSmearOn: CalendarDate | null
  readonly remarks: string | null
  readonly source: HistorySource
}

/* -------------------------------------------------------------------------- */
/* Family history                                                             */
/* -------------------------------------------------------------------------- */

export type VitalStatus = 'ALIVE' | 'DECEASED'

/** One relative and one disease, as the OPD form's family-history row. */
export interface FamilyHistoryEntry {
  readonly id: string
  readonly version: number
  readonly relation: string
  readonly vitalStatus: VitalStatus
  readonly disease: string
  readonly onsetAgeYears: number | null
  /** Her age now, or at death when deceased. */
  readonly currentAgeYears: number | null
  readonly remarks: string | null
}

export const FAMILY_RELATIONS: readonly string[] = [
  'Husband', 'Mother', 'Father', 'Sister', 'Brother', 'Son', 'Daughter',
  'Maternal grandmother', 'Maternal grandfather', 'Paternal grandmother', 'Paternal grandfather',
  'Mother-in-law', 'Father-in-law',
]

/* -------------------------------------------------------------------------- */
/* Past history                                                               */
/* -------------------------------------------------------------------------- */

/** Her own past illnesses: one free-text record, versioned. Null until first written. */
export interface PastHistory {
  readonly version: number
  readonly notes: string | null
  readonly updatedAt: string
}

/** The quick-add list beside the past-history text box. */
export const PAST_HISTORY_OPTIONS: readonly string[] = [
  'Epilepsy',
  'Asthma',
  'Cardiovascular disorders',
  'Tuberculosis',
]

/* -------------------------------------------------------------------------- */
/* Immunizations                                                              */
/* -------------------------------------------------------------------------- */

export type ImmunizationStatus = 'PLANNED' | 'GIVEN' | 'NOT_GIVEN' | 'UNKNOWN'

export interface ImmunizationRecord {
  readonly id: string
  readonly pregnancyId: string
  readonly vaccine: string
  readonly status: ImmunizationStatus
  readonly administeredOn: CalendarDate | null
  readonly facility: string | null
  readonly batchNumber: string | null
  readonly source: HistorySource
}

/**
 * The vaccines the immunization card lists, in the order the paper card does.
 *
 * A list of what can be recorded, not a schedule. Nothing here says a dose is
 * due: that depends on gestation, prior doses and local protocol, and is the
 * clinician's call (PRD §3). A vaccine with no row prints as "not recorded".
 */
export const IMMUNIZATION_CATALOG: readonly { readonly vaccine: string; readonly group: string }[] = [
  { vaccine: 'Td 1', group: 'Tetanus-diphtheria' },
  { vaccine: 'Td 2', group: 'Tetanus-diphtheria' },
  { vaccine: 'Td booster', group: 'Tetanus-diphtheria' },
  { vaccine: 'Tdap', group: 'Pertussis' },
  { vaccine: 'Influenza', group: 'Seasonal' },
  { vaccine: 'COVID-19', group: 'Seasonal' },
  { vaccine: 'Hepatitis B 1', group: 'Hepatitis B' },
  { vaccine: 'Hepatitis B 2', group: 'Hepatitis B' },
  { vaccine: 'Hepatitis B 3', group: 'Hepatitis B' },
  { vaccine: 'MMR / Rubella (pre-pregnancy)', group: 'Pre-pregnancy' },
  { vaccine: 'Varicella (pre-pregnancy)', group: 'Pre-pregnancy' },
  { vaccine: 'HPV (pre-pregnancy)', group: 'Pre-pregnancy' },
]

/* -------------------------------------------------------------------------- */
/* Labels — the OPD form's own wording                                        */
/* -------------------------------------------------------------------------- */

export const CONCEPTION_LABELS: Record<ConceptionMode, string> = {
  NATURAL: 'Natural',
  IVF: 'IVF',
  IUI: 'IUI',
  OTHER: 'Other',
}

export const GESTATION_LABELS: Record<GestationCategory, string> = {
  FULL_TERM: 'Full term',
  PRE_TERM: 'Pre term (premature)',
  POST_TERM: 'Post term',
  NONE: 'None',
}

export const INDUCED_COMPLICATION_LABELS: Record<InducedComplication, string> = {
  PRE_ECLAMPSIA: 'Pre-eclampsia',
  ECLAMPSIA: 'Eclampsia',
  GESTATIONAL_DM: 'Gestational DM',
  PIH: 'PIH',
  HYPEREMESIS: 'Hyper-emesis',
}

export const RELATED_COMPLICATION_LABELS: Record<RelatedComplication, string> = {
  PLACENTA_PREVIA: 'Placenta previa',
  PLACENTAL_ABRUPTION: 'Placental abruption',
  ECTOPIC: 'Ectopic',
  CMV: 'CMV',
  HELLP: 'HELLP',
}

export const PLURALITY_LABELS: Record<Plurality, string> = {
  SINGLE: 'Single birth',
  TWINS: 'Twins',
  TRIPLETS: 'Triplets',
  QUADRUPLETS: 'Quadruplets',
  QUINTUPLETS: 'Quintuplets',
  OTHER: 'Other',
}

/** How many babies a plurality implies, for laying out the per-baby rows. */
export const PLURALITY_COUNT: Record<Plurality, number> = {
  SINGLE: 1,
  TWINS: 2,
  TRIPLETS: 3,
  QUADRUPLETS: 4,
  QUINTUPLETS: 5,
  OTHER: 1,
}

export const INFANT_OUTCOME_LABELS: Record<InfantOutcome, string> = {
  ALIVE: 'Alive',
  STILL_BIRTH: 'Still birth',
  NEONATAL_DEATH: 'Neonatal death',
  IUFD: 'IUFD',
  CHILD_DEATH: 'Child death',
}

export const INFANT_SEX_LABELS: Record<InfantSex, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  AMBIGUOUS: 'Ambiguous',
}

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  VAGINAL: 'Normal vaginal',
  ASSISTED_VAGINAL: 'Assisted vaginal',
  LSCS_EMERGENCY: 'LSCS (emergency)',
  LSCS_ELECTIVE: 'LSCS (elective)',
  UNKNOWN: 'Not recorded',
}

export const PRIOR_OUTCOME_LABELS: Record<PriorOutcome, string> = {
  LIVE_BIRTH: 'Live birth',
  STILLBIRTH: 'Stillbirth',
  ABORTION_SPONTANEOUS: 'Spontaneous abortion',
  ABORTION_INDUCED: 'Induced abortion',
  ECTOPIC: 'Ectopic',
  MOLAR: 'Molar',
  UNKNOWN: 'Not recorded',
}

export const BABY_POSITIONS: readonly string[] = [
  'Cephalic', 'Breech', 'Transverse', 'Oblique', 'Face', 'Brow',
]

export const CYCLE_REGULARITY_LABELS: Record<CycleRegularity, string> = {
  REGULAR: 'Regular',
  IRREGULAR: 'Irregular',
}

export const FLOW_LABELS: Record<MenstrualFlow, string> = {
  SCANTY: 'Scanty',
  MODERATE: 'Moderate',
  HEAVY: 'Heavy',
}

export const PMS_EMOTIONAL_OPTIONS: readonly string[] = [
  'Irritability', 'Mood swings', 'Anxiety', 'Low mood', 'Crying spells', 'Poor concentration',
]

export const PMS_PHYSICAL_OPTIONS: readonly string[] = [
  'Bloating', 'Breast tenderness', 'Headache', 'Fatigue', 'Back pain', 'Acne', 'Cramps',
]

export const IMMUNIZATION_STATUS_LABELS: Record<ImmunizationStatus, string> = {
  GIVEN: 'Given',
  PLANNED: 'Pending',
  NOT_GIVEN: 'Not given',
  UNKNOWN: 'Status unknown',
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A recorded list as words: the items, "None", or "Not recorded".
 *
 * Centralised so no screen renders an unasked list as an empty cell, which on a
 * summary table reads exactly like "none".
 */
export function describeRecordedList<T extends string>(
  list: RecordedList<T>,
  labels?: Partial<Record<T, string>>,
): string {
  if (list.kind === 'NOT_RECORDED') return 'Not recorded'
  if (list.items.length === 0) return 'None'
  return list.items.map((item) => labels?.[item] ?? item).join(', ')
}

export function describeYesNo(value: YesNo): string {
  return value === 'YES' ? 'Yes' : value === 'NO' ? 'No' : 'Not recorded'
}

/** The date a prior pregnancy is listed under: the day, the year, or a dash. */
export function obstetricHistoryDate(entry: ObstetricHistoryRecord): string {
  return entry.eventDate ?? (entry.yearOfEvent !== null ? String(entry.yearOfEvent) : '—')
}

/** `Twins · Alive, Neonatal death`, or just the plurality when no babies are recorded. */
export function describeChildren(entry: ObstetricHistoryRecord): string {
  const plurality =
    entry.plurality === null
      ? 'Not recorded'
      : entry.plurality === 'OTHER' && entry.pluralityOther
        ? entry.pluralityOther
        : PLURALITY_LABELS[entry.plurality]

  const outcomes = entry.infants
    .map((infant) => (infant.outcome ? INFANT_OUTCOME_LABELS[infant.outcome] : null))
    .filter((label): label is string => label !== null)

  return outcomes.length > 0 ? `${plurality} · ${outcomes.join(', ')}` : plurality
}

/** `Full term (39 wk)`, `39 wk`, or "Not recorded". */
export function describeGestationAtDelivery(entry: ObstetricHistoryRecord): string {
  const category = entry.gestationCategory ? GESTATION_LABELS[entry.gestationCategory] : null
  const weeks = entry.gestationWeeksAtDelivery !== null ? `${entry.gestationWeeksAtDelivery} wk` : null
  if (category && weeks) return `${category} (${weeks})`
  return category ?? weeks ?? 'Not recorded'
}
