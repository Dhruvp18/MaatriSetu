import 'server-only'

import { userClient } from '@core/db/clients'

/**
 * Password authentication.
 *
 * Separate from `session.ts`, which answers "who is acting and with what
 * authority". This file only proves identity — it grants nothing. A successful
 * result here still yields no access until `resolveSession` finds an active
 * clinic membership.
 *
 * It lives in `core/auth` rather than beside the sign-in route because the
 * routing layer may not open a database client (ARCH-1). That rule exists so
 * authorization cannot be bypassed by reaching past the service layer, and
 * authentication is not a reason to make an exception to it.
 */

/**
 * Outcome of a sign-in attempt.
 *
 * Carries no detail about *why* a failure occurred. Distinguishing "no such
 * account" from "wrong password" tells an attacker which staff addresses at a
 * hospital are real, which is the first step in targeting them.
 */
export type AuthenticationResult = { readonly ok: true } | { readonly ok: false }

export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<AuthenticationResult> {
  const db = await userClient()
  const { error } = await db.auth.signInWithPassword({ email, password })

  return error ? { ok: false } : { ok: true }
}

/**
 * End the current session.
 *
 * Clearing the clinic choice is the caller's job — that cookie belongs to the
 * session layer, not to authentication.
 */
export async function endSession(): Promise<void> {
  const db = await userClient()
  await db.auth.signOut()
}
