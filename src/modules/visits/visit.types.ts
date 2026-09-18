/**
 * Visit domain types.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework.
 *
 * Two shapes here exist because of ARCH-9 ("units live next to values") and the
 * clinical reality behind it:
 *
 *   - Every measurement field is named with its unit. `weightKg`, not `weight`.
 *     A bare `weight` crossing a boundary is the defect the rule is about:
 *     56 kilograms and 56 pounds are both plausible for a person, and nothing
 *     downstream can tell them apart.
 *
 *   - Blood pressure is one optional object, not two optional numbers. A
 *     diastolic without a systolic is not a low reading — it is not a blood
 *     pressure at all, and the type says so.
 */

import type { CalendarDate } from '@core/obstetrics/dating'

export type VisitType = 'ANC_OPD' | 'FOLLOW_UP' | 'EMERGENCY' | 'OTHER'

export type VisitStatus = 'OPEN' | 'SAVED' | 'CANCELLED'

/**
 * Point-of-care dipstick grades.
 *
 * A graded scale rather than free text, because "+", "1+" and "trace" written
 * by three different nurses are otherwise impossible to trend. `NIL` is a
 * recorded negative result; the absence of the field is "not tested", and the
 * two are different (ARCH-10).
 */
export type DipstickGrade =
  | 'NIL' | 'TRACE' | 'ONE_PLUS' | 'TWO_PLUS' | 'THREE_PLUS' | 'FOUR_PLUS'

export type DatingMethod = 'LMP' | 'ULTRASOUND' | 'CLINICAL_ESTIMATE' | 'UNKNOWN'

/** A blood pressure. Both halves or neither. */
export interface BloodPressure {
  readonly systolicMmHg: number
  readonly diastolicMmHg: number
}

/**
 * One set of observations taken at one moment.
 *
 * Every field is optional because partial recording is normal: a nurse who
 * takes only a weight has recorded a weight, and forcing placeholder zeros
 * would fabricate readings that a clinician would then read as real.
 */
export interface VitalsReading {
  readonly id: string
  /** Which reading this is within the visit. A recheck is the next number. */
  readonly sequenceNo: number
  readonly bloodPressure: BloodPressure | null
  readonly pulseBpm: number | null
  readonly respiratoryRateBpm: number | null
  readonly temperatureC: number | null
  readonly spo2Percent: number | null
  readonly weightKg: number | null
  readonly fundalHeightCm: number | null
  readonly fetalHeartRateBpm: number | null
  readonly urineAlbumin: DipstickGrade | null
  readonly urineSugar: DipstickGrade | null
  readonly note: string | null
  readonly recordedAt: string
  readonly recordedBy: string | null
}

export interface VisitClosure {
  readonly savedAt: string | null
  readonly savedBy: string | null
  readonly cancelledAt: string | null
  readonly cancelledBy: string | null
  readonly cancellationReason: string | null
}

export interface Visit {
  readonly id: string
  readonly clinicId: string
  readonly patientId: string
  readonly pregnancyId: string
  readonly visitType: VisitType
  readonly status: VisitStatus
  readonly occurredAt: string
  /**
   * Gestational age frozen at save, in days. Null while the visit is open.
   *
   * Null is not missing data — it means "this consultation has not been saved,
   * so compute the gestational age live from the pregnancy's current dating".
   * Once set it is never recomputed: a later redating must not rewrite the
   * number a past consultation was reasoned from.
   */
  readonly gaDaysAtVisit: number | null
  readonly datingMethodAtVisit: DatingMethod | null
  readonly impression: string | null
  readonly clinicianId: string | null
  readonly openedBy: string | null
  readonly closure: VisitClosure
  readonly version: number
}

/** A visit together with every reading taken during it, in order. */
export interface VisitWithVitals {
  readonly visit: Visit
  readonly vitals: readonly VitalsReading[]
}

/** What `open_or_reuse_visit` did. */
export interface OpenedVisit {
  readonly visit: Visit
  /**
   * False when an open visit already existed and was returned instead.
   *
   * The UI reopens the consultation rather than reporting an error: a
   * double-clicked "start visit" is routine, not a mistake worth interrupting
   * the counter for.
   */
  readonly created: boolean
}

/* -------------------------------------------------------------------------- */
/* Derived values                                                             */
/* -------------------------------------------------------------------------- */

/** A saved visit is read-only; corrections are attributed amendments. */
export function isEditable(visit: Visit): boolean {
  return visit.status === 'OPEN'
}

/**
 * The most recent reading, or null when none has been taken.
 *
 * Readings are ordered by sequence number, which is assigned in the database
 * under the visit's lock — so this is the latest by recording order, not by a
 * clock that two terminals might disagree about.
 */
export function latestVitals(
  vitals: readonly VitalsReading[],
): VitalsReading | null {
  if (vitals.length === 0) return null
  return vitals.reduce((latest, r) => (r.sequenceNo > latest.sequenceNo ? r : latest))
}

/**
 * Every blood pressure recorded during the visit, in order.
 *
 * The whole reason vitals are rows: a recheck after fifteen minutes is the
 * comparison the clinician wants, and it is only visible if both readings
 * survive.
 */
export function bloodPressureSeries(
  vitals: readonly VitalsReading[],
): readonly { sequenceNo: number; recordedAt: string; bloodPressure: BloodPressure }[] {
  return vitals
    .filter((r): r is VitalsReading & { bloodPressure: BloodPressure } => r.bloodPressure !== null)
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .map((r) => ({
      sequenceNo: r.sequenceNo,
      recordedAt: r.recordedAt,
      bloodPressure: r.bloodPressure,
    }))
}

/** `120/80 mmHg`. The unit is never dropped, including on a printed slip. */
export function formatBloodPressure(bp: BloodPressure): string {
  return `${bp.systolicMmHg}/${bp.diastolicMmHg} mmHg`
}

/**
 * Dipstick grade as printed on a chart.
 *
 * `NIL` renders as "Nil", a recorded negative. A field that was never tested
 * has no entry here at all, so it cannot be mistaken for one.
 */
export function formatDipstick(grade: DipstickGrade): string {
  switch (grade) {
    case 'NIL':
      return 'Nil'
    case 'TRACE':
      return 'Trace'
    case 'ONE_PLUS':
      return '1+'
    case 'TWO_PLUS':
      return '2+'
    case 'THREE_PLUS':
      return '3+'
    case 'FOUR_PLUS':
      return '4+'
  }
}

/** A measured value with the unit it was measured in. */
export interface Quantity {
  readonly label: string
  readonly value: string
  readonly unit: string
}

/**
 * A reading as labelled quantities, for rendering and for the referral slip.
 *
 * Only the fields actually recorded appear. Nothing is emitted for a value that
 * was not taken, so a handover document cannot show a blank next to a label and
 * invite the reader to treat it as normal (ARCH-10).
 *
 * Built here rather than in each component so the unit travels with the number
 * everywhere it is displayed (ARCH-9).
 */
export function vitalsAsQuantities(reading: VitalsReading): readonly Quantity[] {
  const out: Quantity[] = []

  if (reading.bloodPressure) {
    out.push({
      label: 'BP',
      value: `${reading.bloodPressure.systolicMmHg}/${reading.bloodPressure.diastolicMmHg}`,
      unit: 'mmHg',
    })
  }
  if (reading.pulseBpm !== null) {
    out.push({ label: 'Pulse', value: String(reading.pulseBpm), unit: 'bpm' })
  }
  if (reading.respiratoryRateBpm !== null) {
    out.push({ label: 'Resp', value: String(reading.respiratoryRateBpm), unit: '/min' })
  }
  if (reading.temperatureC !== null) {
    out.push({ label: 'Temp', value: reading.temperatureC.toFixed(1), unit: '°C' })
  }
  if (reading.spo2Percent !== null) {
    out.push({ label: 'SpO₂', value: String(reading.spo2Percent), unit: '%' })
  }
  if (reading.weightKg !== null) {
    out.push({ label: 'Weight', value: reading.weightKg.toFixed(1), unit: 'kg' })
  }
  if (reading.fundalHeightCm !== null) {
    out.push({ label: 'Fundal height', value: reading.fundalHeightCm.toFixed(1), unit: 'cm' })
  }
  if (reading.fetalHeartRateBpm !== null) {
    out.push({ label: 'FHR', value: String(reading.fetalHeartRateBpm), unit: 'bpm' })
  }
  if (reading.urineAlbumin !== null) {
    out.push({ label: 'Urine albumin', value: formatDipstick(reading.urineAlbumin), unit: '' })
  }
  if (reading.urineSugar !== null) {
    out.push({ label: 'Urine sugar', value: formatDipstick(reading.urineSugar), unit: '' })
  }

  return out
}

/** Whether a reading carries any observation at all. */
export function hasAnyMeasurement(reading: VitalsReading): boolean {
  return vitalsAsQuantities(reading).length > 0
}

/** The date a visit happened, in the clinic's calendar terms. */
export function visitDate(visit: Visit, timeZone: string): CalendarDate {
  // Intl gives the calendar date in the clinic's zone. A consultation at 00:30
  // IST is that day's visit, not the previous day's, which is what a UTC slice
  // of the timestamp would say.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date(visit.occurredAt))
}
