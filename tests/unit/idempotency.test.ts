import { describe, expect, it } from 'vitest'

import { hashPayload, newRequestKey } from '@core/idempotency/request-key'

/**
 * The property these protect: a genuine retry must fingerprint identically, and
 * a different save must not.
 *
 * Both directions matter. Too strict and a legitimate retry is rejected as a
 * conflict, stranding a clinician mid-consultation. Too loose and one
 * clinician's save silently replaces another's.
 */

describe('keys', () => {
  it('mints a distinct key per attempt', () => {
    const keys = new Set(Array.from({ length: 100 }, newRequestKey))
    expect(keys.size).toBe(100)
  })
})

describe('a genuine retry fingerprints identically', () => {
  it('ignores object key order', () => {
    // The same request serialised by two clients, or two versions of one.
    expect(hashPayload({ impression: 'Stable', visitId: 'v1' })).toBe(
      hashPayload({ visitId: 'v1', impression: 'Stable' }),
    )
  })

  it('ignores key order at any depth', () => {
    expect(
      hashPayload({ advice: { labOrders: ['CBC'], dfkc: true }, visitId: 'v1' }),
    ).toBe(hashPayload({ visitId: 'v1', advice: { dfkc: true, labOrders: ['CBC'] } }))
  })

  it('treats an omitted field and an undefined one as the same', () => {
    expect(hashPayload({ visitId: 'v1' })).toBe(
      hashPayload({ visitId: 'v1', impression: undefined }),
    )
  })

  it('is stable across calls', () => {
    const payload = { visitId: 'v1', prescriptions: [{ medicineName: 'Folic acid' }] }
    expect(hashPayload(payload)).toBe(hashPayload(payload))
  })
})

describe('a different save fingerprints differently', () => {
  it('notices a changed value', () => {
    expect(hashPayload({ impression: 'Stable' })).not.toBe(
      hashPayload({ impression: 'Stable.' }),
    )
  })

  it('notices an added field', () => {
    expect(hashPayload({ visitId: 'v1' })).not.toBe(
      hashPayload({ visitId: 'v1', impression: 'Stable' }),
    )
  })

  it('notices a cleared field', () => {
    // Explicit null is a real change — the clinician deleted the impression.
    expect(hashPayload({ visitId: 'v1', impression: 'Stable' })).not.toBe(
      hashPayload({ visitId: 'v1', impression: null }),
    )
  })

  it('respects array order', () => {
    // Order is meaningful in a prescription list; two drugs swapped is a
    // different request, not the same one rearranged.
    expect(hashPayload({ rx: ['Iron', 'Calcium'] })).not.toBe(
      hashPayload({ rx: ['Calcium', 'Iron'] }),
    )
  })

  it('does not confuse a number with its string form', () => {
    // 100 mg and "100" mg must not collide.
    expect(hashPayload({ doseAmount: 100 })).not.toBe(hashPayload({ doseAmount: '100' }))
  })

  it('distinguishes an empty list from an absent one', () => {
    expect(hashPayload({ prescriptions: [] })).not.toBe(hashPayload({}))
  })
})

describe('shape of the fingerprint', () => {
  it('is lowercase hex, matching the bytea column it is compared against', () => {
    expect(hashPayload({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})
