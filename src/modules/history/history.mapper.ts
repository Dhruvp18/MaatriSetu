import type { Database } from '@core/db/database.types'

import type {
  ConceptionMode,
  CycleRegularity,
  GestationCategory,
  ImmunizationRecord,
  InducedComplication,
  InfantOutcome,
  InfantRecord,
  InfantSex,
  BowelBladder,
  FamilyHistoryEntry,
  PastHistory,
  MenstrualFlow,
  MenstrualHistoryRecord,
  ObstetricHistoryRecord,
  Plurality,
  RecordedList,
  RelatedComplication,
  YesNo,
} from './history.types'

/**
 * History rows, and how they become domain objects.
 *
 * Separated from the repository so the one decision that matters here is
 * testable without a database: a NULL array column is "not recorded" and an
 * empty one is "none", and the two must never be collapsed (ARCH-10).
 *
 * The text-coded columns (conception_mode, outcome, …) are constrained by CHECKs
 * in migration 0024, so the narrowing casts below cannot see a value outside
 * their unions — but an unexpected one is mapped to null rather than trusted.
 */

type Tables = Database['public']['Tables']

export type ObstetricHistoryRow = Tables['obstetric_history']['Row']
export type InfantRow = Tables['obstetric_history_infants']['Row']
export type MenstrualHistoryRow = Tables['menstrual_histories']['Row']
export type FamilyHistoryRow = Tables['family_histories']['Row']
export type PastHistoryRow = Tables['patient_past_histories']['Row']
export type ImmunizationRow = Tables['immunizations']['Row']

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function toRecordedList<T extends string>(
  value: readonly string[] | null,
  allowed?: readonly T[],
): RecordedList<T> {
  if (value === null) return { kind: 'NOT_RECORDED' }
  const items = allowed
    ? value.filter((item): item is T => (allowed as readonly string[]).includes(item))
    : (value as readonly T[])
  return { kind: 'RECORDED', items }
}

export function toYesNo(value: boolean | null): YesNo {
  return value === null ? 'NOT_RECORDED' : value ? 'YES' : 'NO'
}

const INDUCED: readonly InducedComplication[] = [
  'PRE_ECLAMPSIA', 'ECLAMPSIA', 'GESTATIONAL_DM', 'PIH', 'HYPEREMESIS',
]
const RELATED: readonly RelatedComplication[] = [
  'PLACENTA_PREVIA', 'PLACENTAL_ABRUPTION', 'ECTOPIC', 'CMV', 'HELLP',
]

export function toInfantRecord(row: InfantRow): InfantRecord {
  return {
    fetusNo: row.fetus_no,
    outcome: oneOf<InfantOutcome>(row.outcome, [
      'ALIVE', 'STILL_BIRTH', 'NEONATAL_DEATH', 'IUFD', 'CHILD_DEATH',
    ]),
    outcomeRemarks: row.outcome_remarks,
    deliveredOn: row.delivered_on,
    // Postgres `time` arrives as HH:MM:SS; the form and the table show minutes.
    deliveredTime: row.delivered_time ? row.delivered_time.slice(0, 5) : null,
    birthWeightGrams: row.birth_weight_grams,
    sex: oneOf<InfantSex>(row.sex, ['MALE', 'FEMALE', 'AMBIGUOUS']),
    apgar1Min: row.apgar_1_min,
    apgar5Min: row.apgar_5_min,
    apgar10Min: row.apgar_10_min,
  }
}

export function toObstetricHistoryRecord(
  row: ObstetricHistoryRow,
  infants: readonly InfantRow[],
): ObstetricHistoryRecord {
  return {
    id: row.id,
    sequenceNo: row.sequence_no,
    version: row.version,
    eventDate: row.event_date,
    yearOfEvent: row.year_of_event,
    outcome: row.outcome,
    deliveryMode: row.delivery_mode,
    gestationWeeksAtDelivery: row.gestation_weeks_at_delivery,
    gestationCategory: oneOf<GestationCategory>(row.gestation_category, [
      'FULL_TERM', 'PRE_TERM', 'POST_TERM', 'NONE',
    ]),
    conceptionMode: oneOf<ConceptionMode>(row.conception_mode, ['NATURAL', 'IVF', 'IUI', 'OTHER']),
    conceptionRemarks: row.conception_remarks,
    babyPosition: row.baby_position,
    inducedComplications: toRecordedList(row.induced_complications, INDUCED),
    inducedComplicationsRemarks: row.induced_complications_remarks,
    relatedComplications: toRecordedList(row.related_complications, RELATED),
    relatedComplicationsRemarks: row.related_complications_remarks,
    plurality: oneOf<Plurality>(row.plurality, [
      'SINGLE', 'TWINS', 'TRIPLETS', 'QUADRUPLETS', 'QUINTUPLETS', 'OTHER',
    ]),
    pluralityOther: row.plurality_other,
    hasUterineScar: row.has_uterine_scar,
    scarIndication: row.scar_indication,
    placeOfEvent: row.place_of_event,
    remarks: row.remarks,
    infants: infants
      .filter((infant) => infant.history_id === row.id)
      .sort((a, b) => a.fetus_no - b.fetus_no)
      .map(toInfantRecord),
    source: row.source,
    recordedAt: row.recorded_at,
  }
}

export function toMenstrualHistoryRecord(row: MenstrualHistoryRow): MenstrualHistoryRecord {
  return {
    id: row.id,
    version: row.version,
    recordedOn: row.recorded_on,
    lmp: row.lmp,
    menarcheAgeYears: row.menarche_age_years,
    durationDays: row.duration_days,
    cycleLengthDays: row.cycle_length_days,
    cycleRegularity: oneOf<CycleRegularity>(row.cycle_regularity, ['REGULAR', 'IRREGULAR']),
    flow: oneOf<MenstrualFlow>(row.flow, ['SCANTY', 'MODERATE', 'HEAVY']),
    padsPerDay: row.pads_per_day,
    pmsEmotional: toRecordedList<string>(row.pms_emotional),
    pmsPhysical: toRecordedList<string>(row.pms_physical),
    impactsActivities: toYesNo(row.impacts_activities),
    dysmenorrhea: toYesNo(row.dysmenorrhea),
    lastPapSmearOn: row.last_pap_smear_on,
    bowelBladder: oneOf<BowelBladder>(row.bowel_bladder, ['NORMAL', 'DYSURIA', 'DYSCHEZIA', 'DYSPAREUNIA']),
    remarks: row.remarks,
    source: row.source,
  }
}

export function toImmunizationRecord(row: ImmunizationRow): ImmunizationRecord {
  return {
    id: row.id,
    pregnancyId: row.pregnancy_id,
    vaccine: row.vaccine,
    status: row.status,
    administeredOn: row.administered_on,
    facility: row.administered_at_facility,
    batchNumber: row.batch_number,
    source: row.source,
  }
}

export function toFamilyHistoryEntry(row: FamilyHistoryRow): FamilyHistoryEntry {
  return {
    id: row.id,
    version: row.version,
    relation: row.relation,
    vitalStatus: row.vital_status === 'DECEASED' ? 'DECEASED' : 'ALIVE',
    disease: row.disease,
    onsetAgeYears: row.onset_age_years,
    currentAgeYears: row.current_age_years,
    remarks: row.remarks,
  }
}

export function toPastHistory(row: PastHistoryRow): PastHistory {
  return { version: row.version, notes: row.notes, updatedAt: row.updated_at }
}
