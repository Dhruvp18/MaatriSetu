/**
 * Medication orders, and doses actually given.
 *
 * The distinction between the two is the point of this module. A prescription
 * is what was *ordered*; a `MedicationAdministration` is what was *given*, with
 * a mandatory timestamp. The emergency referral slip exists to stop a receiving
 * unit re-loading magnesium sulphate on a mother who already had it, and an
 * order is not evidence that a dose reached her.
 */

import type { CalendarDate } from '@core/obstetrics/dating'

export type DoseFrequency =
  | 'OD' | 'BD' | 'TDS' | 'QID' | 'HS' | 'SOS' | 'PRN' | 'STAT' | 'WEEKLY' | 'OTHER'

export type FoodRelation = 'BEFORE_FOOD' | 'AFTER_FOOD' | 'WITH_FOOD' | 'NOT_SPECIFIED'

export type MedicationRoute =
  | 'ORAL' | 'IV' | 'IM' | 'SC' | 'PR' | 'PV' | 'TOPICAL' | 'INHALED' | 'OTHER'

export type PrescriptionStatus = 'ACTIVE' | 'COMPLETED' | 'STOPPED' | 'SUPERSEDED'

export type AdministrationCertainty =
  | 'WITNESSED' | 'DOCUMENTED' | 'PATIENT_REPORTED' | 'UNCERTAIN'

/**
 * A dose. Amount and unit together, or explicitly unspecified.
 *
 * A union so `{ amount: 500, unit: null }` cannot exist — "500" of an unnamed
 * thing is not a dose (ARCH-9). Some orders genuinely carry no numeric dose
 * ("apply locally"), which is what the second branch is for.
 */
export type Dose =
  | { readonly kind: 'SPECIFIED'; readonly amount: number; readonly unit: string }
  | { readonly kind: 'UNSPECIFIED' }

export interface Prescription {
  readonly id: string
  readonly visitId: string
  readonly medicineName: string
  readonly dose: Dose
  /** 'Tab', 'Cap', 'Syrup', 'Inj'. */
  readonly form: string | null
  readonly route: MedicationRoute
  readonly frequency: DoseFrequency
  readonly foodRelation: FoodRelation
  readonly durationDays: number | null
  readonly startDate: CalendarDate
  readonly endDate: CalendarDate | null
  readonly status: PrescriptionStatus
  readonly instructions: string | null
  readonly stopReason: string | null
  readonly prescribedBy: string
}

/** A dose actually given, with the time it was given. */
export interface MedicationAdministration {
  readonly id: string
  readonly medicineName: string
  readonly amount: number
  readonly unit: string
  readonly route: MedicationRoute
  /**
   * Mandatory, and an instant rather than a date.
   *
   * The clinical value of the record is the elapsed time since the dose. "MgSO4
   * given today" is not actionable; "given at 01:40" is.
   */
  readonly administeredAt: string
  readonly administeredAtFacility: string | null
  readonly certainty: AdministrationCertainty
  readonly note: string | null
  readonly recordedBy: string
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

const FREQUENCY_LABELS: Record<DoseFrequency, string> = {
  OD: 'once daily',
  BD: 'twice daily',
  TDS: 'three times daily',
  QID: 'four times daily',
  HS: 'at night',
  SOS: 'if needed',
  PRN: 'as required',
  STAT: 'immediately, once',
  WEEKLY: 'weekly',
  OTHER: 'as directed',
}

const FOOD_LABELS: Record<FoodRelation, string> = {
  BEFORE_FOOD: 'before food',
  AFTER_FOOD: 'after food',
  WITH_FOOD: 'with food',
  NOT_SPECIFIED: '',
}

/**
 * `Tab. Ferrous ascorbate 100 mg — once daily, after food`.
 *
 * Spelled out rather than abbreviated. "OD" and "BD" are unambiguous to the
 * doctor who typed them and a known source of dosing error for everyone else
 * who reads the line afterwards — including the mother's own card.
 */
export function formatPrescription(prescription: Prescription): string {
  const head = [
    prescription.form ? `${prescription.form}.` : null,
    prescription.medicineName,
    prescription.dose.kind === 'SPECIFIED'
      ? `${prescription.dose.amount} ${prescription.dose.unit}`
      : null,
  ]
    .filter(Boolean)
    .join(' ')

  const tail = [
    FREQUENCY_LABELS[prescription.frequency],
    FOOD_LABELS[prescription.foodRelation],
  ]
    .filter(Boolean)
    .join(', ')

  return tail ? `${head} — ${tail}` : head
}

/**
 * The morning–noon–night tablet pattern Indian prescriptions are written in.
 *
 * Only the schedules that map onto a daily pattern have one. SOS, STAT and
 * weekly doses have no pattern, and inventing one ("0-0-0") would read as a
 * drug that is not to be taken at all.
 */
export const DOSING_PATTERN: Partial<Record<DoseFrequency, string>> = {
  OD: '1-0-0',
  BD: '1-0-1',
  TDS: '1-1-1',
  QID: '1-1-1-1',
  HS: '0-0-1',
}

/** The abbreviation a clinician writes, as opposed to the words a slip prints. */
export const FREQUENCY_CODES: Record<DoseFrequency, string> = {
  OD: 'OD',
  BD: 'BD',
  TDS: 'TDS',
  QID: 'QID',
  HS: 'HS',
  SOS: 'SOS',
  PRN: 'PRN',
  STAT: 'STAT',
  WEEKLY: 'Weekly',
  OTHER: 'As directed',
}

export function describeFrequency(frequency: DoseFrequency): string {
  return FREQUENCY_LABELS[frequency]
}

export function describeFoodRelation(relation: FoodRelation): string | null {
  return FOOD_LABELS[relation] || null
}

/** `1-0-1 (BD)`, or just the code when the schedule has no daily pattern. */
export function formatDosing(frequency: DoseFrequency): string {
  const pattern = DOSING_PATTERN[frequency]
  return pattern ? `${pattern} (${FREQUENCY_CODES[frequency]})` : FREQUENCY_CODES[frequency]
}

/** `Tab. Ferrous ascorbate 100 mg` — the drug, without its schedule. */
export function formatDrug(prescription: Prescription): string {
  return [
    prescription.form ? `${prescription.form}.` : null,
    prescription.medicineName,
    prescription.dose.kind === 'SPECIFIED'
      ? `${prescription.dose.amount} ${prescription.dose.unit}`
      : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Is this order still running on the given day?
 *
 * Derived from status and dates rather than read from a stored flag. PRD §8
 * carried an `is_ongoing` boolean, which meant stopping a drug required editing
 * the past visit that ordered it — rewriting history to describe the present.
 */
export function isOngoingOn(prescription: Prescription, on: CalendarDate): boolean {
  if (prescription.status !== 'ACTIVE') return false
  if (prescription.startDate > on) return false
  if (prescription.endDate !== null && prescription.endDate < on) return false
  return true
}
