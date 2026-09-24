import type { Database } from '@core/db/database.types'

import type { Appointment, DayListEntry, DayReason } from './schedule.types'

/**
 * Appointment rows, and how the day list is assembled from three sources.
 *
 * `assembleDayList` is kept free of I/O so the merge — one row per patient,
 * every reason she is there, the visit status winning over the booking — is
 * testable without a database.
 */

export type AppointmentRow = Database['public']['Tables']['appointments']['Row']

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patientId: row.patient_id,
    pregnancyId: row.pregnancy_id,
    scheduledOn: row.scheduled_on,
    purpose: row.purpose,
  }
}

export interface DaySources {
  readonly appointments: readonly Appointment[]
  readonly followUpPatientIds: readonly string[]
  readonly visits: readonly { patientId: string; status: 'OPEN' | 'SAVED'; openedAt: string }[]
  readonly patients: ReadonlyMap<string, { fullName: string; uhid: string }>
}

export function assembleDayList(sources: DaySources): DayListEntry[] {
  const entries = new Map<string, { reasons: Set<DayReason>; entry: Omit<DayListEntry, 'reasons'> }>()

  const touch = (patientId: string) => {
    let current = entries.get(patientId)
    if (!current) {
      const patient = sources.patients.get(patientId)
      current = {
        reasons: new Set(),
        entry: {
          patientId,
          fullName: patient?.fullName ?? 'Unknown patient',
          uhid: patient?.uhid ?? '—',
          appointmentId: null,
          purpose: null,
          visit: null,
        },
      }
      entries.set(patientId, current)
    }
    return current
  }

  for (const appointment of sources.appointments) {
    const current = touch(appointment.patientId)
    current.reasons.add('APPOINTMENT')
    current.entry = { ...current.entry, appointmentId: appointment.id, purpose: appointment.purpose }
  }
  for (const patientId of sources.followUpPatientIds) touch(patientId).reasons.add('FOLLOW_UP_ADVISED')
  for (const visit of sources.visits) {
    const current = touch(visit.patientId)
    current.reasons.add('VISIT')
    // An open visit is the live one; a saved one only if nothing is open.
    if (!current.entry.visit || visit.status === 'OPEN') {
      current.entry = { ...current.entry, visit: { status: visit.status, openedAt: visit.openedAt } }
    }
  }

  const rank = (entry: DayListEntry) =>
    entry.visit?.status === 'OPEN' ? 0 : entry.visit === null ? 1 : 2

  return [...entries.values()]
    .map(({ reasons, entry }) => ({ ...entry, reasons: [...reasons] }))
    .sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName))
}
