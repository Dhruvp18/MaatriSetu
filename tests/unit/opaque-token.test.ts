import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { hashToken, hashesMatch, looksLikeToken, mintToken } from '@core/tokens/opaque-token'

describe('mintToken', () => {
  it('returns a raw token and its matching hash', () => {
    const token = mintToken()
    expect(token.hashHex).toBe(hashToken(token.raw))
  })

  it('produces base64url only, so it survives a URL path and a QR code', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(mintToken().raw).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('never repeats', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) seen.add(mintToken().raw)
    expect(seen.size).toBe(1000)
  })

  it('carries at least 256 bits of entropy', () => {
    // 32 random bytes encode to 43 base64url characters. A shorter token would
    // mean a sticker someone could plausibly guess their way into.
    expect(mintToken().raw.length).toBeGreaterThanOrEqual(43)
  })
})

describe('hashToken', () => {
  it('is SHA-256 in lowercase hex, which is what decode(..., \'hex\') expects', () => {
    expect(hashToken('sticker-value')).toBe(
      createHash('sha256').update('sticker-value', 'utf8').digest('hex'),
    )
    expect(hashToken('sticker-value')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across calls, or a reissued sticker would stop matching', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'))
  })

  it('separates tokens differing by one character', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })
})

describe('hashesMatch', () => {
  it('accepts identical hashes', () => {
    const hash = hashToken('x')
    expect(hashesMatch(hash, hash)).toBe(true)
  })

  it('rejects different hashes', () => {
    expect(hashesMatch(hashToken('x'), hashToken('y'))).toBe(false)
  })

  it('rejects a length mismatch without throwing', () => {
    expect(hashesMatch(hashToken('x'), 'abcd')).toBe(false)
  })

  it('rejects empty input rather than treating it as a match', () => {
    expect(hashesMatch('', '')).toBe(false)
  })
})

describe('looksLikeToken', () => {
  it('accepts a minted token', () => {
    expect(looksLikeToken(mintToken().raw)).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['too short to be ours', 'abc123'],
    // A product barcode or another hospital's sticker should be turned away at
    // the door, not sent to the database as a lookup key.
    ['a product barcode', '8901234567890'.padEnd(13, '0')],
    ['a URL', 'https://example.org/referral/abcdefghijklmnop'],
    ['SQL-ish punctuation', "abcdefghijklmnop' or '1'='1"],
    ['whitespace', 'abcdefghijklmnop pqrs'],
  ])('rejects %s', (_label, value) => {
    expect(looksLikeToken(value)).toBe(false)
  })

  it('rejects an unbounded string', () => {
    expect(looksLikeToken('a'.repeat(5000))).toBe(false)
  })
})
