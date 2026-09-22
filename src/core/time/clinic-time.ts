/**
 * Instants, as typed by a person standing in a clinic.
 *
 * `core/obstetrics/dating` covers calendar dates, where the whole point is that
 * there is no time of day. This file covers the opposite case: a nurse typing
 * "02:14" into a form, meaning 02:14 on the ward clock.
 *
 * ---------------------------------------------------------------------------
 * Why a helper rather than `new Date(value)`
 * ---------------------------------------------------------------------------
 * An `<input type="datetime-local">` submits `2026-09-22T02:14` with no zone.
 * `new Date()` on the server resolves that against the SERVER's zone, and
 * passing it to Postgres resolves it against the DATABASE SESSION's zone —
 * which is UTC. In IST that is a five-and-a-half-hour error, silently, on the
 * one field the whole referral slip hangs on: a magnesium sulphate dose said to
 * have been given at 02:14 would be recorded as 07:44.
 *
 * The clinic's zone is carried on the actor precisely so this conversion can be
 * done explicitly, at the boundary, and never guessed.
 *
 * No domain knowledge here (ARCH-3): this module does not know what a referral
 * or a dose is.
 */

/** `YYYY-MM-DDTHH:mm`, as an `<input type="datetime-local">` submits it. */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export class InvalidLocalTimeError extends Error {
  constructor(value: string) {
    super(`Not a local date-time (expected YYYY-MM-DDTHH:mm): ${JSON.stringify(value)}`)
    this.name = 'InvalidLocalTimeError'
  }
}

/**
 * The offset of `timeZone` from UTC at a given instant, in milliseconds.
 *
 * Derived by formatting the instant in that zone and reading the wall clock
 * back, because there is no API that simply states it. Positive east of
 * Greenwich, so `utc + offset = wall clock`.
 */
function offsetMillisAt(utcMillis: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMillis))

  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  // `hour12: false` renders midnight as 24 in some ICU versions; normalised so
  // the reconstruction below does not land a day late.
  const hour = field('hour') % 24

  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    hour,
    field('minute'),
    field('second'),
  )

  return asIfUtc - utcMillis
}

/**
 * A wall-clock time in a clinic, as an ISO instant.
 *
 * Two passes: the first offset is looked up using the value read as though it
 * were UTC, the second using the instant that produced. They differ only across
 * a DST transition — India has none, but a wrong timestamp on a handover slip
 * is not the place to rely on that staying true.
 *
 * A local time that does not exist (the hour a clock springs forward) resolves
 * to the instant the offset change implies rather than throwing: refusing to
 * record a dose because of a calendar edge case is the worse failure.
 */
export function instantFromClinicLocal(local: string, timeZone: string): string {
  const match = LOCAL_DATETIME.exec(local)
  if (!match) throw new InvalidLocalTimeError(local)

  const [, year, month, day, hour, minute, second] = match

  const asIfUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  )

  const firstGuess = asIfUtc - offsetMillisAt(asIfUtc, timeZone)
  const instant = asIfUtc - offsetMillisAt(firstGuess, timeZone)

  return new Date(instant).toISOString()
}

/**
 * An instant as the clinic's wall clock, for pre-filling a form field.
 *
 * Returns `YYYY-MM-DDTHH:mm` — exactly what `<input type="datetime-local">`
 * accepts as a value, and what `instantFromClinicLocal` reads back.
 */
export function clinicLocalFromInstant(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso))

  const field = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00'

  const hour = String(Number(field('hour')) % 24).padStart(2, '0')

  return `${field('year')}-${field('month')}-${field('day')}T${hour}:${field('minute')}`
}

/**
 * `02:14` on the clinic's clock.
 *
 * Used wherever a time is read rather than edited — the referral slip prints
 * the ward's clock, because that is the clock the person reading it is looking
 * at.
 */
export function formatClinicTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** `22 Sep 2026, 02:14`. The date is spelled so a printed slip cannot be misread. */
export function formatClinicDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * `22 Sep 2026`, from an instant, on the clinic's clock.
 *
 * The date-only counterpart of `formatClinicDateTime`, for documents where a
 * time would be noise — a printed visit slip records the day of the
 * consultation, not the minute the record was written.
 *
 * The zone still matters even though the time is dropped: a consultation at
 * 00:30 IST is 19:00 the previous day in UTC, and a slip dated a day early is
 * a slip that does not match the paper file it sits beside.
 */
export function formatClinicDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

/**
 * `22 Sep 2026`, from a calendar date such as an LMP or a due date.
 *
 * Takes `YYYY-MM-DD`, which carries no time and no zone, and must therefore be
 * read in UTC. Interpreting it in the clinic's zone would shift it a day
 * backwards for any zone east of Greenwich — including every Indian clinic.
 * `core/obstetrics/dating` holds the arithmetic for these; this only spells
 * one out for print, because `12/09` and `09/12` are the same string to two
 * different readers and a due date is not a thing to be ambiguous about.
 */
export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}
