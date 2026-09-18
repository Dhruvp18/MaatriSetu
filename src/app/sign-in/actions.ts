'use server'

import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { cookies } from 'next/headers'

import { authenticateWithPassword, endSession } from '@core/auth/credentials'
import { safeDestination } from '@core/auth/safe-redirect'
import { clinicCookieName } from '@core/auth/session'

/**
 * Sign-in and sign-out.
 *
 * Thin by rule (ARCH-1): parse the form, call Supabase auth, redirect. No
 * clinical logic and no authorization decisions — authority comes from
 * `clinic_memberships` when the actor is resolved, not from signing in.
 */

const CredentialsSchema = z.object({
  email: z.email('Enter the email address you were given.'),
  password: z.string().min(1, 'Enter your password.'),
})

export interface SignInState {
  readonly error: string | null
}

/**
 * Validated in `@core/auth/safe-redirect`, which is pure and exhaustively
 * tested against the usual open-redirect techniques.
 *
 * `typedRoutes` cannot check a destination that only exists at runtime, so the
 * cast is unavoidable. What makes it safe is that validation, not the type.
 */
const safeRedirect = (next: string | null): Route => safeDestination(next) as Route

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details entered.' }
  }

  const result = await authenticateWithPassword(parsed.data.email, parsed.data.password)

  if (!result.ok) {
    // Deliberately generic, and deliberately identical whether the address is
    // unknown or the password is wrong. Distinguishing them tells an attacker
    // which staff addresses are real.
    return { error: 'That email address and password do not match.' }
  }

  redirect(safeRedirect(formData.get('next')?.toString() ?? null))
}

export async function signOut(): Promise<void> {
  await endSession()

  // Clear the clinic choice too. Leaving it behind would silently pre-select a
  // clinic for whoever signs in next on a shared OPD counter machine.
  const store = await cookies()
  store.delete(clinicCookieName)

  redirect('/sign-in')
}

/** Record which clinic this session acts in, for multi-clinic staff. */
export async function chooseClinic(formData: FormData): Promise<void> {
  const clinicId = formData.get('clinicId')?.toString()
  if (!clinicId) return

  const store = await cookies()
  // A hint only. `resolveSession` matches this against memberships read from
  // the database, so a forged value selects nothing rather than granting access.
  store.set(clinicCookieName, clinicId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  })

  redirect('/clinic')
}
