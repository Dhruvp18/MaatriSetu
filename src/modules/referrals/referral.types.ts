/**
 * Emergency referral domain types.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework.
 *
 * Two shapes carry almost all of this file's weight.
 *
 *   `ReferralDocument` is a union, not a record with a nullable snapshot. A
 *   referral is either a draft — editable, incomplete, nobody's handover
 *   document yet — or a frozen slip that is already travelling with a patient.
 *   Expressing that as `issuedSnapshot: Snapshot | null` would put both states
 *   in one type and leave every screen to remember which it was looking at. The
 *   union makes "edit an issued referral" fail to compile, which is the only
 *   place that rule can be enforced cheaply enough to be enforced everywhere.
 *
 *   `ReferralSnapshot` is the document itself, and every field on it that can
 *   be unknown is a tagged object rather than a null. This is ARCH-10 at its
 *   most literal: the slip is read at 2 AM by someone who has never seen this
 *   patient, and a blank line next to "Allergies" is indistinguishable from
 *   "none". Modelling the absence as a value forces every renderer to say which
 *   one it means.
 */

import { formatGestationalAge, splitGestationalAge } from '@core/obstetrics/dating'

/**
 * Shape version of the frozen document.
 *
 * Stored on every issued referral. A slip issued today must still render
 * correctly after this format changes, so the version travels with the blob
 * rather than being inferred from the code that happens to be deployed.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1

export type ReferralStatus = 'DRAFT' | 'ISSUED' | 'SUPERSEDED' | 'CANCELLED'

export type MembraneStatus = 'INTACT' | 'RUPTURED' | 'NOT_ASSESSED'

export type DipstickGrade =
  | 'NIL' | 'TRACE' | 'ONE_PLUS' | 'TWO_PLUS' | 'THREE_PLUS' | 'FOUR_PLUS'

export type MedicationRoute =
  | 'ORAL' | 'IV' | 'IM' | 'SC' | 'PR' | 'PV' | 'TOPICAL' | 'INHALED' | 'OTHER'

/**
 * How firmly we know a dose was given.
 *
 * Travels with every administered dose on the slip. "The nurse who pushed it
 * says so" and "the attendant thinks she had something at the last hospital"
 * are both worth printing and must never be printed the same way.
 */
export type AdministrationCertainty =
  | 'WITNESSED' | 'DOCUMENTED' | 'PATIENT_REPORTED' | 'UNCERTAIN'

export type BloodGroup =
  | 'A_POS' | 'A_NEG' | 'B_POS' | 'B_NEG'
  | 'AB_POS' | 'AB_NEG' | 'O_POS' | 'O_NEG'

export type DataSource =
  | 'CLINICIAN_ENTERED' | 'STAFF_ENTERED' | 'EXTRACTED_VERIFIED'
  | 'PATIENT_REPORTED' | 'EXTERNAL_RECORD'

/* -------------------------------------------------------------------------- */
/* The frozen document                                                        */
/* -------------------------------------------------------------------------- */

/** A blood pressure. Both halves or neither — a lone diastolic is not a reading. */
export interface SnapshotBloodPressure {
  readonly systolicMmHg: number
  readonly diastolicMmHg: number
}

/**
 * Age as it was known at issue.
 *
 * `basis` is printed alongside the number. A documented date of birth and an
 * age the mother stated at booking are different claims, and on a slip that may
 * drive a weight-based dose the difference is worth four characters of ink.
 */
export type SnapshotAge =
  | { readonly status: 'UNKNOWN' }
  | {
      readonly status: 'KNOWN'
      readonly years: number
      readonly basis: 'DATE_OF_BIRTH' | 'STATED'
    }

export type SnapshotBloodGroup =
  | { readonly status: 'NOT_RECORDED' }
  | {
      readonly status: 'KNOWN'
      readonly value: BloodGroup
      readonly source: DataSource
      readonly recordedOn: string | null
    }

export interface SnapshotAllergy {
  readonly substance: string
  readonly reaction: string | null
  readonly severity: 'UNKNOWN' | 'MILD' | 'MODERATE' | 'SEVERE'
}

/**
 * Allergy state, in three values.
 *
 * `UNKNOWN` is not an empty list — nobody has asked — and `NONE_KNOWN` is a
 * clinician's recorded negative. A receiving unit choosing an antibiotic needs
 * to know which of those it is looking at.
 */
export interface SnapshotAllergies {
  readonly status: 'UNKNOWN' | 'NONE_KNOWN' | 'KNOWN'
  readonly items: readonly SnapshotAllergy[]
}

export type SnapshotDating =
  | { readonly status: 'NOT_ESTABLISHED' }
  | {
      readonly status: 'ESTABLISHED'
      /** Frozen at issue. A later redating must not rewrite what was handed over. */
      readonly gaDays: number
      readonly estimatedDueDate: string
      readonly method: string
      readonly certainty: string
    }

/**
 * Prior uterine scar, in three values rather than a boolean.
 *
 * A boolean would make "she has no recorded scar" and "we hold no obstetric
 * history for her at all" the same answer. For a decision about a trial of
 * labour they are not remotely the same answer.
 */
export type SnapshotUterineScar =
  | { readonly status: 'NO_HISTORY_RECORDED' }
  | { readonly status: 'NONE_IN_RECORDED_HISTORY' }
  | { readonly status: 'PRESENT'; readonly count: number }

export interface SnapshotPregnancy {
  readonly dating: SnapshotDating
  readonly gravida: number | null
  readonly parity: number | null
  readonly living: number | null
  readonly abortions: number | null
  readonly uterineScar: SnapshotUterineScar
  readonly priorPregnanciesOnRecord: number
}

export type SnapshotTransferVitals =
  | { readonly status: 'NOT_RECORDED' }
  | {
      readonly status: 'RECORDED'
      /** Mandatory. "BP 160/110" with no time is not a transfer observation. */
      readonly recordedAt: string
      readonly bloodPressure: SnapshotBloodPressure | null
      readonly pulseBpm: number | null
      readonly respiratoryRateBpm: number | null
      readonly spo2Percent: number | null
      readonly temperatureC: number | null
      readonly urineAlbumin: DipstickGrade | null
      readonly fetalHeartRateBpm: number | null
    }

export type SnapshotExamination =
  | { readonly status: 'NOT_PERFORMED' }
  | {
      readonly status: 'PERFORMED'
      readonly examinedAt: string
      readonly examinedBy: string | null
      readonly dilatationCm: number | null
      readonly effacementPercent: number | null
      readonly station: string | null
      readonly membranes: MembraneStatus
      readonly liquor: string | null
    }

/**
 * A dose actually given before transfer.
 *
 * Sourced from `medication_administrations` and never from `prescriptions`.
 * That is the entire clinical point of this feature: an order is a decision, an
 * administration is an event with a time, and only the second one answers "can
 * I give her magnesium sulphate now".
 */
export interface SnapshotDose {
  readonly medicineName: string
  readonly amount: number
  readonly unit: string
  readonly route: MedicationRoute
  readonly administeredAt: string
  readonly facility: string | null
  readonly certainty: AdministrationCertainty
  readonly note: string | null
}

export interface SnapshotResult {
  readonly testName: string
  readonly category: string
  readonly valueNumeric: number | null
  readonly valueText: string | null
  readonly unit: string | null
  readonly observedDate: string
  readonly observedDatePrecision: string
  readonly source: DataSource
  readonly clinicianNote: string | null
}

export interface SnapshotFacility {
  readonly name: string
  readonly address?: string | null
  readonly phone?: string | null
  readonly doctorName?: string | null
  readonly contact?: string | null
}

/**
 * The complete handover document, exactly as frozen at issue.
 *
 * The print view and the public page both render from this and nothing else, so
 * they cannot disagree. Nothing here is an id that has to be resolved against a
 * live table — every join a renderer might need was already resolved inside the
 * issuing transaction, because each such join is a way for the document to
 * change after it was handed to a relative in a corridor.
 */
export interface ReferralSnapshot {
  readonly schemaVersion: number
  readonly issuedAt: string
  readonly asOfDate: string
  /**
   * The issuing clinic's IANA zone, frozen with the document.
   *
   * The public page has no session and so no actor to carry one. Every time on
   * the slip is the ward clock both ends are looking at; rendering them in the
   * reader's own zone would shift a dose time by hours without saying so.
   */
  readonly timeZone: string
  readonly issuedBy: { readonly name: string; readonly registrationNo: string | null }
  readonly referringFacility: SnapshotFacility
  readonly receivingFacility: SnapshotFacility
  readonly transfer: {
    readonly mode: string | null
    readonly departureAt: string | null
    readonly accompanyingStaff: string | null
    readonly linesAndCatheters: string | null
  }
  readonly patient: {
    readonly uhid: string
    readonly fullName: string
    readonly age: SnapshotAge
    readonly bloodGroup: SnapshotBloodGroup
    readonly allergies: SnapshotAllergies
  }
  readonly pregnancy: SnapshotPregnancy
  readonly transferVitals: SnapshotTransferVitals
  readonly examination: SnapshotExamination
  readonly preReferralDoses: readonly SnapshotDose[]
  readonly recentResults: readonly SnapshotResult[]
  readonly indication: string
  readonly clinicalSummary: string | null
  readonly supersedesReferralId: string | null
}

/* -------------------------------------------------------------------------- */
/* The referral record                                                        */
/* -------------------------------------------------------------------------- */

/** Everything a clinician may still change. Exists only while status is DRAFT. */
export interface ReferralDraftFields {
  readonly referringFacility: string | null
  readonly referringDoctorName: string | null
  readonly referringContactPhone: string | null
  readonly receivingFacility: string | null
  readonly receivingContact: string | null
  readonly transportMode: string | null
  readonly departureAt: string | null
  readonly indication: string | null
  readonly clinicalSummary: string | null
  readonly transferVitals: SnapshotTransferVitals
  readonly examination: SnapshotExamination
  readonly linesAndCatheters: string | null
  readonly accompanyingStaff: string | null
}

/**
 * What state this referral is in, and what that state makes available.
 *
 * A draft has editable fields and no document; an issued or superseded referral
 * has a document and nothing editable. The union is what makes that rule
 * structural rather than a convention somebody has to remember at 2 AM.
 */
export type ReferralDocument =
  | { readonly state: 'DRAFT'; readonly draft: ReferralDraftFields }
  | {
      readonly state: 'ISSUED'
      readonly snapshot: ReferralSnapshot
      readonly snapshotSchemaVersion: number
      readonly issuedAt: string
      readonly issuedBy: string
    }
  | {
      readonly state: 'SUPERSEDED'
      readonly snapshot: ReferralSnapshot
      readonly snapshotSchemaVersion: number
      readonly issuedAt: string
      readonly issuedBy: string
      readonly supersededAt: string
    }
  | {
      readonly state: 'CANCELLED'
      readonly cancelledAt: string
      readonly cancelledBy: string | null
      readonly reason: string
    }

export interface Referral {
  readonly id: string
  readonly clinicId: string
  readonly patientId: string
  readonly pregnancyId: string
  /** Null for the common case: a transfer is not necessarily inside a visit. */
  readonly originVisitId: string | null
  /** The issued referral this one replaces, if it is a correction. */
  readonly supersedesId: string | null
  readonly document: ReferralDocument
  readonly createdBy: string
  readonly createdAt: string
  readonly version: number
}

/**
 * A link to an issued referral.
 *
 * `id` and the timestamps only — the hash never leaves the database, and the
 * raw token is not recoverable from anything in this type.
 */
export interface ReferralLink {
  readonly id: string
  readonly expiresAt: string
  readonly revokedAt: string | null
  readonly issuedBy: string
  readonly createdAt: string
}

/**
 * A freshly minted link.
 *
 * `token` is present exactly once, in the response that creates it. Only its
 * hash is stored, so this is the sole opportunity to print or encode it; a lost
 * link is re-issued, never recovered.
 */
export interface MintedReferralLink {
  readonly tokenId: string
  readonly token: string
  readonly expiresAt: string
}

/**
 * What the public page got.
 *
 * One `DENIED` variant with no detail, deliberately. Expired, revoked and
 * never-existed must be indistinguishable to whoever is holding the link: a
 * page that says "this link has expired" has just confirmed that the link was
 * real, to someone who may have guessed it. The database records which it
 * actually was; the type above it cannot express the difference.
 */
export type ReferralAccess =
  | { readonly outcome: 'GRANTED'; readonly referralId: string; readonly snapshot: ReferralSnapshot }
  | { readonly outcome: 'DENIED' }

/* -------------------------------------------------------------------------- */
/* Derived values and display                                                 */
/* -------------------------------------------------------------------------- */

/** Only a draft can be edited. Issued documents are replaced, never revised. */
export function isEditable(referral: Referral): boolean {
  return referral.document.state === 'DRAFT'
}

/** The frozen document, or null while this referral is still a draft. */
export function issuedSnapshot(referral: Referral): ReferralSnapshot | null {
  const doc = referral.document
  return doc.state === 'ISSUED' || doc.state === 'SUPERSEDED' ? doc.snapshot : null
}

/** `32w + 4d`, or the honest sentence when nothing anchors the dating. */
export function describeSnapshotDating(dating: SnapshotDating): string {
  if (dating.status === 'NOT_ESTABLISHED') return 'Dating not established'
  return formatGestationalAge(splitGestationalAge(dating.gaDays))
}

/** `O−`, with a true minus sign: Rh status is the first thing read on a slip. */
export function formatBloodGroup(group: BloodGroup): string {
  const [letters, sign] = group.split('_')
  return `${letters}${sign === 'POS' ? '+' : '−'}`
}

export function describeSnapshotBloodGroup(group: SnapshotBloodGroup): string {
  return group.status === 'NOT_RECORDED' ? 'Not recorded' : formatBloodGroup(group.value)
}

/**
 * Allergy wording for the slip.
 *
 * Centralised so that no renderer invents its own phrasing and turns "nobody
 * asked" into reassurance. `KNOWN` with an empty list still reads as unknown
 * rather than as a clean history — the status said allergies exist, so an empty
 * list is missing detail, not an absence of allergy.
 */
export function describeSnapshotAllergies(allergies: SnapshotAllergies): string {
  switch (allergies.status) {
    case 'UNKNOWN':
      return 'Not recorded — ask before prescribing'
    case 'NONE_KNOWN':
      return 'No known allergies'
    case 'KNOWN':
      return allergies.items.length === 0
        ? 'Allergy recorded, detail missing — ask before prescribing'
        : allergies.items
            .map((a) => (a.reaction ? `${a.substance} (${a.reaction})` : a.substance))
            .join(', ')
  }
}

export function describeUterineScar(scar: SnapshotUterineScar): string {
  switch (scar.status) {
    case 'NO_HISTORY_RECORDED':
      return 'No obstetric history on record'
    case 'NONE_IN_RECORDED_HISTORY':
      return 'None in recorded history'
    case 'PRESENT':
      return scar.count === 1 ? '1 previous scar recorded' : `${scar.count} previous scars recorded`
  }
}

/** `G2 P1 L1 A0`, with a dash wherever a count was never asked. */
export function formatGpla(pregnancy: SnapshotPregnancy): string {
  const part = (label: string, value: number | null) => `${label}${value ?? '–'}`
  return [
    part('G', pregnancy.gravida),
    part('P', pregnancy.parity),
    part('L', pregnancy.living),
    part('A', pregnancy.abortions),
  ].join(' ')
}

/**
 * How long ago a dose was given, as `1 h 35 min ago`.
 *
 * This string is the most clinically active thing on the whole slip. "MgSO4
 * given today" supports no decision; "given 1 h 35 min ago" decides whether the
 * next dose is due, early or dangerous. Computed against a clock the caller
 * supplies so it can be rendered deterministically and tested.
 *
 * A dose timestamped in the future is a data-entry error and is labelled as
 * such rather than silently shown as "0 min ago".
 */
export function formatElapsed(administeredAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(administeredAt).getTime()) / 60_000)

  if (!Number.isFinite(minutes)) return 'time not recorded'
  if (minutes < 0) return 'timestamp is in the future — check this'
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  const rest = minutes - hours * 60

  if (hours < 48) return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`

  return `${Math.floor(hours / 24)} days ago`
}

/** `Inj. MgSO4 4 g IV`. The unit never travels apart from the number (ARCH-9). */
export function formatDose(dose: SnapshotDose): string {
  return `${dose.medicineName} ${dose.amount} ${dose.unit} ${dose.route}`
}

const CERTAINTY_LABELS: Record<AdministrationCertainty, string> = {
  WITNESSED: 'witnessed',
  DOCUMENTED: 'from written record',
  PATIENT_REPORTED: 'reported by patient or attendant',
  UNCERTAIN: 'uncertain',
}

export function describeCertainty(certainty: AdministrationCertainty): string {
  return CERTAINTY_LABELS[certainty]
}

const DIPSTICK_LABELS: Record<DipstickGrade, string> = {
  NIL: 'Nil',
  TRACE: 'Trace',
  ONE_PLUS: '1+',
  TWO_PLUS: '2+',
  THREE_PLUS: '3+',
  FOUR_PLUS: '4+',
}

/** `NIL` is a recorded negative; a field never tested has no entry at all. */
export function formatDipstick(grade: DipstickGrade): string {
  return DIPSTICK_LABELS[grade]
}

export interface Quantity {
  readonly label: string
  readonly value: string
  readonly unit: string
}

/**
 * Transfer vitals as labelled quantities, in the order a receiving unit reads
 * them.
 *
 * Only what was measured is emitted. Nothing is produced for an unmeasured
 * value, so the slip cannot show a blank beside a label and invite the reader
 * to treat it as normal (ARCH-10).
 */
export function transferVitalsAsQuantities(
  vitals: SnapshotTransferVitals,
): readonly Quantity[] {
  if (vitals.status === 'NOT_RECORDED') return []

  const out: Quantity[] = []

  if (vitals.bloodPressure) {
    out.push({
      label: 'BP',
      value: `${vitals.bloodPressure.systolicMmHg}/${vitals.bloodPressure.diastolicMmHg}`,
      unit: 'mmHg',
    })
  }
  if (vitals.pulseBpm !== null) {
    out.push({ label: 'Pulse', value: String(vitals.pulseBpm), unit: 'bpm' })
  }
  if (vitals.respiratoryRateBpm !== null) {
    out.push({ label: 'Resp', value: String(vitals.respiratoryRateBpm), unit: '/min' })
  }
  if (vitals.spo2Percent !== null) {
    out.push({ label: 'SpO₂', value: String(vitals.spo2Percent), unit: '%' })
  }
  if (vitals.temperatureC !== null) {
    out.push({ label: 'Temp', value: vitals.temperatureC.toFixed(1), unit: '°C' })
  }
  if (vitals.urineAlbumin !== null) {
    out.push({ label: 'Urine albumin', value: formatDipstick(vitals.urineAlbumin), unit: '' })
  }
  if (vitals.fetalHeartRateBpm !== null) {
    out.push({ label: 'FHR', value: String(vitals.fetalHeartRateBpm), unit: 'bpm' })
  }

  return out
}

/** A lab result as it should be printed, unit included, or null when unusable. */
export function formatResult(result: SnapshotResult): string | null {
  if (result.valueNumeric !== null) {
    return result.unit ? `${result.valueNumeric} ${result.unit}` : String(result.valueNumeric)
  }
  return result.valueText
}
