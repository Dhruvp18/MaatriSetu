/**
 * Gestational dating arithmetic.
 *
 * Pure functions, no I/O, no framework. Every value here is derived, never
 * stored: PRD §7 decision 4 requires gestational age to be computed at read
 * time so the header badge can never go stale.
 *
 * ---------------------------------------------------------------------------
 * Why dates are strings
 * ---------------------------------------------------------------------------
 * A due date is a calendar fact, not an instant. Representing it as a
 * JavaScript `Date` means it carries a time and a timezone, and a patient dated
 * in Asia/Kolkata whose record is rendered on a UTC server can display a
 * gestational age one day out. Near a milestone boundary — the 20-week anomaly
 * scan window, the 34-week steroid window — a one-day error is clinically
 * meaningful.
 *
 * So calendar dates are ISO `YYYY-MM-DD` strings, and all arithmetic runs in
 * UTC where every day is exactly 86,400 seconds. No DST, no timezone, no drift.
 */

/** An ISO calendar date, `YYYY-MM-DD`. No time, no timezone. */
export type CalendarDate = string

/** Full term, in days. 40 weeks. */
export const TERM_DAYS = 280

/** Longest gestation this module will treat as plausible, in days. */
const MAX_PLAUSIBLE_GA_DAYS = 315

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * How a pregnancy's gestational age is anchored.
 *
 * Deliberately not "an LMP". Real practice routinely redates from a
 * first-trimester scan, and a model that can only express LMP forces staff to
 * back-calculate a fictional LMP which then circulates as though it were
 * something the mother actually recalled.
 *
 * Both dating methods collapse to the same two facts: a date, and how pregnant
 * she was on that date.
 */
export interface DatingReference {
  /** The date the anchor was established. */
  readonly referenceDate: CalendarDate
  /** Gestational age in days on `referenceDate`. Zero when the anchor is the LMP. */
  readonly referenceGaDays: number
}

/** A gestational age, split for display as `32w + 4d`. */
export interface GestationalAge {
  readonly totalDays: number
  readonly weeks: number
  readonly days: number
}

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`Not an ISO calendar date (expected YYYY-MM-DD): ${JSON.stringify(value)}`)
    this.name = 'InvalidDateError'
  }
}

/* -------------------------------------------------------------------------- */
/* Calendar primitives                                                        */
/* -------------------------------------------------------------------------- */

function toUtcMillis(date: CalendarDate): number {
  if (!ISO_DATE.test(date)) throw new InvalidDateError(date)

  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))

  const millis = Date.UTC(year, month - 1, day)

  // Date.UTC happily rolls 2026-02-31 over into March. Round-tripping catches
  // that, so a typo in a recalled LMP fails loudly instead of shifting dating
  // by three days.
  const roundTrip = new Date(millis)
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new InvalidDateError(date)
  }

  return millis
}

function fromUtcMillis(millis: number): CalendarDate {
  return new Date(millis).toISOString().slice(0, 10)
}

const MILLIS_PER_DAY = 86_400_000

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MILLIS_PER_DAY)
}

/** `date` shifted by `days`. Accepts negative values. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  if (!Number.isInteger(days)) {
    throw new TypeError(`addDays requires whole days, received ${days}`)
  }
  return fromUtcMillis(toUtcMillis(date) + days * MILLIS_PER_DAY)
}

/** Today in the given IANA timezone. Clinic-local, not server-local. */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/* -------------------------------------------------------------------------- */
/* Establishing a dating reference                                            */
/* -------------------------------------------------------------------------- */

/** Anchor dating on the last menstrual period: GA is zero on that date. */
export function datingFromLmp(lmp: CalendarDate): DatingReference {
  toUtcMillis(lmp) // validate eagerly
  return { referenceDate: lmp, referenceGaDays: 0 }
}

/**
 * Anchor dating on an ultrasound.
 *
 * `gaDaysAtScan` is the gestational age the scan reported, in days — a scan
 * reading "12w+3d" is 87.
 */
export function datingFromScan(scanDate: CalendarDate, gaDaysAtScan: number): DatingReference {
  toUtcMillis(scanDate)
  if (!Number.isInteger(gaDaysAtScan) || gaDaysAtScan < 0 || gaDaysAtScan > MAX_PLAUSIBLE_GA_DAYS) {
    throw new RangeError(
      `Gestational age at scan must be a whole number of days between 0 and ${MAX_PLAUSIBLE_GA_DAYS}, received ${gaDaysAtScan}`,
    )
  }
  return { referenceDate: scanDate, referenceGaDays: gaDaysAtScan }
}

/* -------------------------------------------------------------------------- */
/* Derived values                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Gestational age on `on`, in days.
 *
 * May return a negative number if `on` precedes conception-by-dating. Callers
 * render that as "dating inconsistent" rather than as a gestational age —
 * silently clamping it to zero would hide a data-entry error.
 */
export function gestationalAgeDays(dating: DatingReference, on: CalendarDate): number {
  return dating.referenceGaDays + daysBetween(dating.referenceDate, on)
}

/** Gestational age on `on`, split into weeks and days for display. */
export function gestationalAge(dating: DatingReference, on: CalendarDate): GestationalAge {
  return splitGestationalAge(gestationalAgeDays(dating, on))
}

/** Split a whole-day gestational age into weeks and days. */
export function splitGestationalAge(totalDays: number): GestationalAge {
  const weeks = Math.floor(totalDays / 7)
  return { totalDays, weeks, days: totalDays - weeks * 7 }
}

/**
 * Format as `32w + 4d`, the notation used on Indian antenatal cards.
 *
 * A negative or implausible age is never dressed up as a gestational age.
 */
export function formatGestationalAge(age: GestationalAge | number): string {
  const value = typeof age === 'number' ? splitGestationalAge(age) : age
  if (value.totalDays < 0) return 'Dating inconsistent'
  if (value.totalDays > MAX_PLAUSIBLE_GA_DAYS) return 'Dating implausible'
  return `${value.weeks}w + ${value.days}d`
}

/**
 * Estimated due date: the date on which gestational age reaches 280 days.
 *
 * Note on Naegele's rule (PRD F1). Classically it is stated as
 * "LMP + 1 year − 3 months + 7 days", which — because months differ in length —
 * lands 0 to 3 days away from LMP + 280 days depending on the month. This
 * module uses LMP + 280 days, which is what obstetric wheels, standard
 * calculators and hospital EMRs use, and which extends naturally to
 * ultrasound-anchored dating where no LMP exists.
 */
export function estimatedDueDate(dating: DatingReference): CalendarDate {
  return addDays(dating.referenceDate, TERM_DAYS - dating.referenceGaDays)
}

/** Whole days remaining until the estimated due date. Negative once past it. */
export function daysUntilDue(dating: DatingReference, on: CalendarDate): number {
  return TERM_DAYS - gestationalAgeDays(dating, on)
}

export type Trimester = 1 | 2 | 3

/**
 * Trimester, using the conventional boundaries: first through 13w+6d, second
 * through 27w+6d, third thereafter.
 *
 * Returns null outside a plausible gestation rather than guessing.
 */
export function trimester(gaDays: number): Trimester | null {
  if (gaDays < 0 || gaDays > MAX_PLAUSIBLE_GA_DAYS) return null
  if (gaDays < 98) return 1
  if (gaDays < 196) return 2
  return 3
}

/**
 * Whether the two dating methods agree closely enough that redating is not
 * indicated.
 *
 * This is a plain arithmetic comparison, reported as a number of days. It is
 * NOT a recommendation to redate — that threshold varies by gestation and by
 * guideline, and choosing dating is a clinical decision (PRD §3, non-goals).
 * The UI shows the discrepancy and lets the clinician decide.
 */
export function datingDiscrepancyDays(a: DatingReference, b: DatingReference): number {
  return Math.abs(daysBetween(estimatedDueDate(a), estimatedDueDate(b)))
}
