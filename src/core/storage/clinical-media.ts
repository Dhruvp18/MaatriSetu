import 'server-only'

import { serviceClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

/**
 * Private storage for clinical media.
 *
 * Voice notes, photographed lab slips and scan images all live in one private
 * bucket (migration 0020) that only the service role can reach. Nothing here
 * ever returns a permanent URL: a lasting public link to a lab slip is an
 * unauthenticated leak of a patient's results, and an object key is not a
 * secret.
 *
 * When a file genuinely has to reach a browser — a clinician opening the
 * original slip beside an extracted value — `signedUrl` mints a short-lived
 * link for that one object.
 *
 * No domain knowledge (ARCH-3): this module knows about bytes and keys, not
 * about patients.
 */

const BUCKET = 'clinical-media'

/**
 * How long a signed link lives.
 *
 * Long enough to open a slip and read it; short enough that a URL copied into
 * a chat message or left in browser history stops working quickly.
 */
const SIGNED_URL_TTL_SECONDS = 300

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await serviceClient()
    .storage.from(BUCKET)
    .upload(key, body, {
      contentType,
      // Clinical media is written once. An upload that would overwrite an
      // existing object is a bug — two different files claiming one key — and
      // failing loudly is better than silently replacing a stored slip.
      upsert: false,
    })

  if (error) {
    throw internal(`Could not store the file at ${key}.`, error)
  }
}

export async function getObject(key: string): Promise<Uint8Array> {
  const { data, error } = await serviceClient().storage.from(BUCKET).download(key)

  if (error || !data) {
    // The worker retries: an object may legitimately not have landed yet when a
    // large upload and the queue row race each other.
    throw retryable(`Could not read the file at ${key}.`, error)
  }

  return new Uint8Array(await data.arrayBuffer())
}

/** A short-lived link to one object, for a clinician to open it. */
export async function signedUrl(key: string): Promise<string> {
  const { data, error } = await serviceClient()
    .storage.from(BUCKET)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS)

  if (error || !data) {
    throw internal(`Could not create a link for ${key}.`, error)
  }

  return data.signedUrl
}

/**
 * Whether an object exists.
 *
 * Used by the worker to tell "the upload has not finished" from "this file is
 * never coming". The first is worth waiting for; the second should fail the
 * note so a human sees it rather than leaving it queued forever.
 */
export async function objectExists(key: string): Promise<boolean> {
  const lastSlash = key.lastIndexOf('/')
  const folder = lastSlash > 0 ? key.slice(0, lastSlash) : ''
  const name = key.slice(lastSlash + 1)

  const { data, error } = await serviceClient()
    .storage.from(BUCKET)
    .list(folder, { search: name, limit: 1 })

  if (error) return false
  return (data ?? []).some((entry) => entry.name === name)
}

export { BUCKET as CLINICAL_MEDIA_BUCKET }
