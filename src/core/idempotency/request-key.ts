import { createHash, randomUUID } from 'node:crypto'

/**
 * Idempotency keys and payload fingerprints.
 *
 * A clinical commit must be safe to repeat. At two minutes a patient on
 * hospital wifi, two things happen constantly: Save gets double-clicked, and a
 * request times out on the client after it has already succeeded on the server.
 * Neither may produce a second consultation.
 *
 * The scheme has two halves, and both are needed:
 *
 *   The KEY identifies the attempt. It is minted once when the clinician starts
 *   editing and travels with every retry of that same save, so the server can
 *   recognise a repeat.
 *
 *   The HASH identifies the content. A key arriving with different content is
 *   not a retry — it is a different save wearing the same name, and applying it
 *   would let one clinician's work silently replace another's. The server
 *   rejects that case rather than guessing which was meant.
 *
 * No domain knowledge here (ARCH-3): this module does not know what a visit is.
 */

/** A fresh key for one editing attempt. */
export function newRequestKey(): string {
  return randomUUID()
}

/**
 * Fingerprint a request body.
 *
 * Canonicalised before hashing, because `{a:1,b:2}` and `{b:2,a:1}` are the
 * same request and must not be treated as a conflicting one. Object keys are
 * sorted recursively; array order is preserved, since order is meaningful in a
 * list of prescriptions.
 *
 * Returned as lowercase hex to match the `bytea` column the routine compares
 * against.
 */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalise(payload), 'utf8').digest('hex')
}

/**
 * Deterministic JSON.
 *
 * `undefined` and `null` are collapsed to null: a field omitted and a field
 * explicitly cleared produce the same request, and treating them as different
 * would reject a legitimate retry from a client that serialises them
 * differently.
 */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null'

  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      // Drop undefined members so that omitting a field and setting it to
      // undefined fingerprint identically.
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalise(member)}`).join(',')}}`
  }

  // Numbers, strings and booleans. JSON.stringify handles escaping, and
  // -0 serialises as 0, which is correct for a fingerprint.
  return JSON.stringify(value)
}
