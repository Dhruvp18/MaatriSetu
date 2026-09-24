/**
 * The clinic day: who is expected, who has been seen.
 *
 * Pure TypeScript. No zod, no row shapes, no framework.
 *
 * An appointment is a plan and a visit is an encounter. The day list shows both
 * side by side and says which is which — a booked patient who has not arrived
 * must never read as one who was seen.
 */

import type { CalendarDate } from '@core/obstetrics/dating'

export interface Appointment {
  readonly id: string
  readonly patientId: string
  readonly pregnancyId: string | null
  readonly scheduledOn: CalendarDate
  readonly purpose: string | null
}

/** Why a patient is on today's list. A patient can be there for several reasons. */
export type DayReason = 'APPOINTMENT' | 'FOLLOW_UP_ADVISED' | 'VISIT'

export interface DayListEntry {
  readonly patientId: string
  readonly fullName: string
  readonly uhid: string
  readonly reasons: readonly DayReason[]
  readonly appointmentId: string | null
  readonly purpose: string | null
  /** Today's visit, if one has been opened. */
  readonly visit: { readonly status: 'OPEN' | 'SAVED'; readonly openedAt: string } | null
}

/** Where a patient is in today's flow, in words for the list. */
export function describeDayStatus(entry: DayListEntry): 'Waiting' | 'In consultation' | 'Seen' {
  if (entry.visit?.status === 'SAVED') return 'Seen'
  if (entry.visit?.status === 'OPEN') return 'In consultation'
  return 'Waiting'
}
