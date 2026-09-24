/**
 * Pregnancy domain types.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework.
 *
 * The episode is the organising entity in antenatal care. Labs, scans, visits
 * and referrals hang off a pregnancy, never off the patient — a mother
 * returning eighteen months later is the same woman with a new episode, and
 * mixing the two corrupts both.
 */

import {
  type CalendarDate,
  type DatingReference,
  type GestationalAge,
  estimatedDueDate,
  gestationalAge,
  trimester,
  type Trimester,
} from '@core/obstetrics/dating'

export type PregnancyStatus = 'ACTIVE' | 'COMPLETED' | 'CLOSED_UNKNOWN'

/** How dating was arrived at. `UNKNOWN` means no anchor exists at all. */
export type DatingMethod = 'LMP' | 'ULTRASOUND' | 'CLINICAL_ESTIMATE' | 'UNKNOWN'

export type DatingCertainty = 'CERTAIN' | 'APPROXIMATE' | 'UNKNOWN'

export type PregnancyOutcome =
  | 'LIVE_BIRTH' | 'STILLBIRTH' | 'ABORTION_SPONTANEOUS' | 'ABORTION_INDUCED'
  | 'ECTOPIC' | 'MOLAR' | 'UNKNOWN'

export type DeliveryMode =
  | 'VAGINAL' | 'ASSISTED_VAGINAL' | 'LSCS_EMERGENCY' | 'LSCS_ELECTIVE' | 'UNKNOWN'

export type DatePrecision = 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN'

export type KnownStatus = 'UNKNOWN' | 'NONE_KNOWN' | 'KNOWN'

export type DataSource =
  | 'CLINICIAN_ENTERED' | 'STAFF_ENTERED' | 'EXTRACTED_VERIFIED'
  | 'PATIENT_REPORTED' | 'EXTERNAL_RECORD'

/**
 * Dating, or the explicit absence of it.
 *
 * A union rather than a nullable reference, and this is deliberate: a
 * pregnancy with no established dating is a real and common state — a woman
 * booking late who cannot recall an LMP and has not yet had a scan. The cockpit
 * must print "dating not established", never a gestational age derived from a
 * guess, and never an empty badge that reads as though the number is simply
 * still loading.
 *
 * Making the absence a variant means every consumer has to decide what to show
 * for it (ARCH-10).
 */
export type PregnancyDating =
  | {
      readonly status: 'ESTABLISHED'
      readonly reference: DatingReference
      /** Never `UNKNOWN` in this variant — an established anchor has a method. */
      readonly method: Exclude<DatingMethod, 'UNKNOWN'>
      readonly certainty: DatingCertainty
      readonly confirmedBy: string | null
      readonly confirmedAt: string | null
    }
  | { readonly status: 'NOT_ESTABLISHED' }

/**
 * The LMP as the mother actually stated it.
 *
 * Kept verbatim even after dating is taken from a scan. It is part of the
 * record of what she said, and it is not used for computation unless it is also
 * the dating anchor — otherwise a redated pregnancy would carry two competing
 * gestational ages.
 */
export interface ReportedLmp {
  readonly date: CalendarDate | null
  readonly certainty: DatingCertainty
}

/**
 * Gravida / Para / Living / Abortions.
 *
 * Snapshotted at the start of this episode rather than derived, because prior
 * events routinely predate this clinic's records entirely. Each is nullable:
 * "not asked" is not "zero".
 */
export interface GravidaParity {
  readonly gravida: number | null
  readonly parity: number | null
  readonly living: number | null
  readonly abortions: number | null
}

/** A prior pregnancy, wherever it happened. */
export interface ObstetricHistoryEntry {
  readonly id: string
  readonly sequenceNo: number
  readonly yearOfEvent: number | null
  readonly eventDate: CalendarDate | null
  readonly eventDatePrecision: DatePrecision
  readonly outcome: PregnancyOutcome
  readonly deliveryMode: DeliveryMode
  readonly gestationWeeksAtDelivery: number | null
  readonly birthWeightGrams: number | null
  readonly childAlive: KnownStatus
  /**
   * A recorded fact. Whether the interval since it is adequate is clinical
   * judgment the system does not make (PRD §3).
   */
  readonly hasUterineScar: boolean
  readonly scarIndication: string | null
  readonly complications: string | null
  readonly placeOfEvent: string | null
  readonly source: DataSource
}

export interface PregnancyClosure {
  readonly outcome: PregnancyOutcome | null
  readonly outcomeDate: CalendarDate | null
  readonly closedAt: string | null
  readonly closedBy: string | null
  readonly note: string | null
}

export interface BirthPlan {
  readonly planned_place?: string
  readonly companion_name?: string
  readonly transport_arranged?: boolean
  readonly blood_donor_identified?: boolean
  readonly funds_saved?: boolean
  readonly special_instructions?: string
}

export interface Pregnancy {
  readonly id: string
  readonly clinicId: string
  readonly patientId: string
  readonly status: PregnancyStatus
  readonly dating: PregnancyDating
  readonly reportedLmp: ReportedLmp
  readonly gravidaParity: GravidaParity
  readonly prePregnancyWeightKg: number | null
  readonly heightCm: number | null
  readonly closure: PregnancyClosure
  readonly birthPlan?: BirthPlan | null
  readonly version: number
  readonly createdAt: string
}

/** A pregnancy plus the prior history that belongs to the same patient. */
export interface PregnancyWithHistory {
  readonly pregnancy: Pregnancy
  readonly obstetricHistory: readonly ObstetricHistoryEntry[]
}

/* -------------------------------------------------------------------------- */
/* Derived values — computed, never stored                                     */
/* -------------------------------------------------------------------------- */

/**
 * Gestational age on a given date, or null when dating is not established.
 *
 * Computed at read time so the header badge cannot go stale (PRD §7 decision
 * 4). Null is the honest answer when there is no anchor; callers render it as
 * "dating not established".
 */
export function gestationalAgeOn(
  dating: PregnancyDating,
  on: CalendarDate,
): GestationalAge | null {
  if (dating.status !== 'ESTABLISHED') return null
  return gestationalAge(dating.reference, on)
}

/** Clinician-confirmed EDD, or null when dating is not established. */
export function expectedDueDate(dating: PregnancyDating): CalendarDate | null {
  if (dating.status !== 'ESTABLISHED') return null
  return estimatedDueDate(dating.reference)
}

/**
 * Trimester on a date, or null.
 *
 * Null covers both "no dating" and a gestational age outside the plausible
 * range, because `trimester()` itself declines to classify one.
 */
export function trimesterOn(dating: PregnancyDating, on: CalendarDate): Trimester | null {
  const age = gestationalAgeOn(dating, on)
  return age === null ? null : trimester(age.totalDays)
}

/** Whether this episode is the one currently being cared for. */
export function isActive(pregnancy: Pregnancy): boolean {
  return pregnancy.status === 'ACTIVE'
}

/**
 * How dating should read in the UI.
 *
 * Centralised so no screen invents its own wording for the unestablished case
 * and accidentally implies a gestational age exists.
 */
export function describeDating(dating: PregnancyDating): string {
  if (dating.status === 'NOT_ESTABLISHED') return 'Dating not established'

  const method =
    dating.method === 'LMP'
      ? 'LMP'
      : dating.method === 'ULTRASOUND'
        ? 'Ultrasound'
        : 'Clinical estimate'

  // The certainty is shown alongside the method rather than hidden, because
  // "dated by ultrasound" and "dated by a half-remembered LMP" support very
  // different decisions.
  const certainty =
    dating.certainty === 'CERTAIN'
      ? ''
      : dating.certainty === 'APPROXIMATE'
        ? ' (approximate)'
        : ' (certainty not recorded)'

  return `Dated by ${method}${certainty}`
}

/**
 * Prior caesarean sections, as recorded facts.
 *
 * Returns the entries, not a count and not a judgment. The cockpit shows which
 * deliveries were LSCS and when; whether that matters for this pregnancy is the
 * clinician's call.
 */
export function priorCaesareans(
  history: readonly ObstetricHistoryEntry[],
): readonly ObstetricHistoryEntry[] {
  return history.filter(
    (entry) => entry.deliveryMode === 'LSCS_EMERGENCY' || entry.deliveryMode === 'LSCS_ELECTIVE',
  )
}
