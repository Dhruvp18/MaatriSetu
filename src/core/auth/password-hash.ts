import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing for the patient portal's own login.
 *
 * Separate from `core/tokens/opaque-token.ts`: a token has full machine
 * entropy and is hashed with plain SHA-256, because there is nothing for a
 * slow KDF to protect against. A password is chosen by a person and has to
 * assume the opposite — that it is guessable — so it is salted and stretched
 * with scrypt, the way `core/auth/credentials.ts` leaves Supabase Auth to do
 * for staff. This is the patient portal's own equivalent, kept here rather
 * than there because a patient is not a Supabase Auth user (ARCH-4: her
 * authorization is "is this her own record", not a staff membership).
 */

const SALT_BYTES = 16
const KEY_LENGTH = 64

/** `<salt-hex>:<hash-hex>`. Both are needed to verify later; neither alone is useful to an attacker without the other and the KDF cost. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const derived = scryptSync(password, salt, KEY_LENGTH)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

/**
 * Constant-time verification.
 *
 * A malformed stored value (wrong shape, wrong salt length) fails closed —
 * it is never treated as "any password matches".
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (salt.length !== SALT_BYTES || expected.length !== KEY_LENGTH) return false

  const actual = scryptSync(password, salt, KEY_LENGTH)
  return timingSafeEqual(actual, expected)
}
