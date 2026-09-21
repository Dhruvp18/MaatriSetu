import { describe, expect, it } from 'vitest'

import { toDose } from '@modules/orders/order.mapper'
import {
  formatPrescription,
  isOngoingOn,
  type Prescription,
} from '@modules/orders/order.types'

function prescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: 'rx-1',
    visitId: 'visit-1',
    medicineName: 'Ferrous ascorbate',
    dose: { kind: 'SPECIFIED', amount: 100, unit: 'mg' },
    form: 'Tab',
    route: 'ORAL',
    frequency: 'OD',
    foodRelation: 'AFTER_FOOD',
    durationDays: 30,
    startDate: '2026-08-01',
    endDate: null,
    status: 'ACTIVE',
    instructions: null,
    stopReason: null,
    prescribedBy: 'doctor-1',
    ...overrides,
  }
}

describe('a dose is an amount and a unit, together or not at all', () => {
  it('reads a complete dose', () => {
    expect(toDose({ id: 'rx-1', dose_amount: 500, dose_unit: 'mg' })).toEqual({
      kind: 'SPECIFIED',
      amount: 500,
      unit: 'mg',
    })
  })

  it('accepts an order with no numeric dose', () => {
    // "Apply locally" is a real prescription.
    expect(toDose({ id: 'rx-1', dose_amount: null, dose_unit: null })).toEqual({
      kind: 'UNSPECIFIED',
    })
  })

  it('refuses half a dose rather than rendering a bare number', () => {
    // "500" of an unnamed thing on a prescription line is how a dose goes
    // wrong. The database forbids it; this is the second line of defence.
    expect(() => toDose({ id: 'rx-1', dose_amount: 500, dose_unit: null })).toThrow()
    expect(() => toDose({ id: 'rx-1', dose_amount: null, dose_unit: 'mg' })).toThrow()
  })
})

describe('prescription lines spell out the schedule', () => {
  it('writes frequency in words, not abbreviations', () => {
    // OD and BD are unambiguous to whoever typed them and a known source of
    // dosing error for everyone reading afterwards, including the mother.
    expect(formatPrescription(prescription())).toBe(
      'Tab. Ferrous ascorbate 100 mg — once daily, after food',
    )

    expect(formatPrescription(prescription({ frequency: 'BD', foodRelation: 'BEFORE_FOOD' }))).toBe(
      'Tab. Ferrous ascorbate 100 mg — twice daily, before food',
    )
  })

  it('omits an unspecified food relation instead of printing an empty clause', () => {
    expect(
      formatPrescription(prescription({ frequency: 'HS', foodRelation: 'NOT_SPECIFIED' })),
    ).toBe('Tab. Ferrous ascorbate 100 mg — at night')
  })

  it('handles an order with no form and no numeric dose', () => {
    expect(
      formatPrescription(
        prescription({
          form: null,
          medicineName: 'Calamine lotion',
          dose: { kind: 'UNSPECIFIED' },
          frequency: 'OTHER',
          foodRelation: 'NOT_SPECIFIED',
        }),
      ),
    ).toBe('Calamine lotion — as directed')
  })
})

describe('"ongoing" is a query, not a stored flag', () => {
  it('counts an active order inside its dates', () => {
    expect(isOngoingOn(prescription(), '2026-09-21')).toBe(true)
  })

  it('excludes an order that has not started', () => {
    expect(isOngoingOn(prescription({ startDate: '2026-10-01' }), '2026-09-21')).toBe(false)
  })

  it('excludes an order that has ended', () => {
    expect(isOngoingOn(prescription({ endDate: '2026-09-01' }), '2026-09-21')).toBe(false)
  })

  it('includes an order ending today', () => {
    expect(isOngoingOn(prescription({ endDate: '2026-09-21' }), '2026-09-21')).toBe(true)
  })

  it('excludes anything not ACTIVE, whatever its dates say', () => {
    for (const status of ['STOPPED', 'COMPLETED', 'SUPERSEDED'] as const) {
      expect(isOngoingOn(prescription({ status }), '2026-09-21')).toBe(false)
    }
  })

  it('never requires editing the visit that ordered it', () => {
    // Stopping a drug sets status and a stop reason on the prescription. The
    // originating visit is untouched, so history still says what was ordered
    // that day.
    const stopped = prescription({ status: 'STOPPED', stopReason: 'Intolerance' })
    expect(stopped.visitId).toBe('visit-1')
    expect(isOngoingOn(stopped, '2026-09-21')).toBe(false)
  })
})
