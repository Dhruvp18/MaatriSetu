import { describe, expect, it } from 'vitest'

import { assembleDayList } from '@modules/schedule/schedule.mapper'
import { describeDayStatus } from '@modules/schedule/schedule.types'

const patients = new Map([
  ['p1', { fullName: 'Asha', uhid: 'U1' }],
  ['p2', { fullName: 'Bina', uhid: 'U2' }],
  ['p3', { fullName: 'Chitra', uhid: 'U3' }],
])

describe('today’s list', () => {
  it('lists a patient once, with every reason she is there', () => {
    const list = assembleDayList({
      appointments: [{ id: 'a1', patientId: 'p1', pregnancyId: null, scheduledOn: '2026-09-24', purpose: 'ANC' }],
      followUpPatientIds: ['p1'],
      visits: [],
      patients,
    })
    expect(list).toHaveLength(1)
    expect(list[0]?.reasons).toEqual(['APPOINTMENT', 'FOLLOW_UP_ADVISED'])
    expect(list[0]?.purpose).toBe('ANC')
  })

  it('never shows a booked patient who has not arrived as seen', () => {
    const [entry] = assembleDayList({
      appointments: [{ id: 'a1', patientId: 'p1', pregnancyId: null, scheduledOn: '2026-09-24', purpose: null }],
      followUpPatientIds: [],
      visits: [],
      patients,
    })
    expect(entry && describeDayStatus(entry)).toBe('Waiting')
  })

  it('puts the patient in consultation first and the seen ones last', () => {
    const list = assembleDayList({
      appointments: [{ id: 'a1', patientId: 'p1', pregnancyId: null, scheduledOn: '2026-09-24', purpose: null }],
      followUpPatientIds: [],
      visits: [
        { patientId: 'p2', status: 'SAVED', openedAt: '2026-09-24T04:00:00Z' },
        { patientId: 'p3', status: 'OPEN', openedAt: '2026-09-24T05:00:00Z' },
      ],
      patients,
    })
    expect(list.map((e) => e.fullName)).toEqual(['Chitra', 'Asha', 'Bina'])
  })

  it('prefers the open visit when a patient has a saved and an open one today', () => {
    const [entry] = assembleDayList({
      appointments: [],
      followUpPatientIds: [],
      visits: [
        { patientId: 'p1', status: 'OPEN', openedAt: '2026-09-24T06:00:00Z' },
        { patientId: 'p1', status: 'SAVED', openedAt: '2026-09-24T04:00:00Z' },
      ],
      patients,
    })
    expect(entry?.visit?.status).toBe('OPEN')
  })
})
