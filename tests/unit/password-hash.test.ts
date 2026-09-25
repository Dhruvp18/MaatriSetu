import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from '@core/auth/password-hash'

describe('password hashing', () => {
  it('verifies the same password that was hashed', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('wrong password', stored)).toBe(false)
  })

  it('never stores the password itself in the hash', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(stored).not.toContain('correct horse battery staple')
  })

  it('salts independently, so the same password hashes differently each time', () => {
    const a = hashPassword('same password')
    const b = hashPassword('same password')
    expect(a).not.toBe(b)
    expect(verifyPassword('same password', a)).toBe(true)
    expect(verifyPassword('same password', b)).toBe(true)
  })

  it('fails closed on a malformed stored value rather than accepting anything', () => {
    expect(verifyPassword('anything', 'not-a-valid-hash')).toBe(false)
    expect(verifyPassword('anything', '')).toBe(false)
  })
})
