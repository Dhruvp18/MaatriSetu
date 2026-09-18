import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Opaque lookup tokens.
 *
 * Two things in this system are addressed by a token that arrives from outside:
 * the QR sticker on a mother's paper file, and the expiring link to an issued
 * referral. Both follow the same rules, so the rules live here once.
 *
 *   1. The token carries no meaning. It is not a patient id, not a UHID, not a
 *      signed payload. Someone photographing a sticker across a waiting room
 *      learns a random string and nothing else.
 *
 *   2. Only its hash is stored. A database dump, a backup or a stray log line
 *      then contains no working key — the same reason a password is not stored.
 *
 *   3. The raw value exists exactly once, in the response that mints it. There
 *      is no way to read it back, which is why a lost sticker is reissued
 *      rather than recovered.
 *
 * No domain knowledge here (ARCH-3): this module does not know what a patient
 * or a referral is.
 */

/**
 * Bytes of entropy per token.
 *
 * 32 bytes is far beyond what a printed sticker needs, but the cost is a longer
 * string inside a QR code, which a scanner does not care about. The failure
 * this guards against — someone enumerating tokens to open patient records — is
 * worth over-buying.
 */
const TOKEN_BYTES = 32

export interface MintedToken {
  /**
   * The value printed on the sticker or embedded in the link. Show it once,
   * then let it go: it is not stored and cannot be recovered.
   */
  readonly raw: string
  /** Lowercase hex SHA-256 of `raw`. This is what the database holds. */
  readonly hashHex: string
}

/** base64url — safe in a URL path and in a QR code without escaping. */
export function mintToken(): MintedToken {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url')
  return { raw, hashHex: hashToken(raw) }
}

/**
 * Hash a token for storage or lookup.
 *
 * Plain SHA-256, deliberately: unlike a password, a token has full machine
 * entropy, so there is nothing for a slow KDF to protect against and a lookup
 * on every QR scan should not cost 100ms.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Constant-time comparison of two hex hashes.
 *
 * Token lookup is a database equality check, so this is for the few places that
 * compare in application code — comparing with `===` there leaks, through
 * timing, how much of a guess was correct.
 */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  if (left.length !== right.length || left.length === 0) return false

  return timingSafeEqual(left, right)
}

/**
 * Whether a scanned value is even shaped like one of our tokens.
 *
 * Lets an obviously foreign QR code — a product barcode, another hospital's
 * sticker — be rejected before it reaches the database, and keeps an
 * unbounded string out of a query.
 */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value)
}
