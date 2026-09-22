import 'server-only'

import { cookies } from 'next/headers'
import { cache } from 'react'

import { userClient } from '@core/db/clients'

import type { StaffActor } from './actor'
import type { ClinicRole } from './permissions'

/**
 * Turning a Supabase session into a `StaffActor`.
 *
 * Authentication answers "who is this person". It does not answer "may they act
 * here, and as what" — that comes from `clinic_memberships`, and a signed-in
 * user with no active membership has no authority at all. Keeping the two
 * separate is what lets a member of staff be a doctor at one facility and hold
 * nothing at another.
 *
 * The role is read from the database on every request. It is never taken from
 * the JWT or from a cookie: revoking someone's access has to take effect now,
 * not whenever their token happens to expire.
 */

/** Cookie naming the chosen clinic when a user belongs to several. */
const CLINIC_COOKIE = 'maatrisetu.clinic'

export interface ClinicOption {
  readonly clinicId: string
  readonly clinicName: string
  readonly clinicTimezone: string
  readonly role: ClinicRole
}

/**
 * Fallback when a clinic row carries no timezone.
 *
 * Every seeded and migrated clinic has one (the column is NOT NULL with a
 * default), so this is unreachable in practice. It exists so that a missing
 * value produces a plausible date rather than an exception deep inside a
 * gestational-age calculation.
 */
const FALLBACK_TIME_ZONE = 'Asia/Kolkata'

/**
 * The outcome of resolving a request's identity.
 *
 * A discriminated union rather than `StaffActor | null`, because the four
 * outcomes need genuinely different handling and collapsing them loses that.
 * "Not signed in" sends you to the sign-in form; "signed in but no membership"
 * must not, or the user is bounced into a redirect loop, re-authenticating
 * successfully and landing back where they started with no explanation.
 */
export type SessionResolution =
  | { readonly status: 'ANONYMOUS' }
  | {
      readonly status: 'NO_MEMBERSHIP'
      readonly authUserId: string
      readonly displayName: string | null
    }
  | {
      readonly status: 'CLINIC_CHOICE_REQUIRED'
      readonly authUserId: string
      readonly displayName: string
      readonly options: readonly ClinicOption[]
    }
  | { readonly status: 'ACTIVE'; readonly actor: StaffActor }

/**
 * Resolve the current request's actor.
 *
 * Reads run through `userClient()`, so RLS applies as an independent second
 * check: even if the membership query below were wrong, the database would not
 * return another clinic's rows.
 *
 * Wrapped in React's `cache`, so a layout and the page inside it share one
 * resolution instead of issuing the same three queries twice. The cache lives
 * for a single request only — a role revoked between requests takes effect on
 * the next one, which is the point of reading it from the database each time.
 *
 * Note this means `requestId` is stable across one request, which is exactly
 * what makes it useful for correlating every audit row that request writes.
 */
export const resolveSession = cache(async function resolveSession(): Promise<SessionResolution> {
  const db = await userClient()

  // getUser() revalidates the token with the auth server. getSession() only
  // decodes the cookie, which a client could have forged, so it must not be
  // used to make an authorization decision.
  const { data: auth, error: authError } = await db.auth.getUser()
  if (authError || !auth.user) return { status: 'ANONYMOUS' }

  const authUserId = auth.user.id

  const { data: staff } = await db
    .from('staff_users')
    .select('id, display_name, is_active')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  // An auth account with no staff profile, or a deactivated one, is a person
  // who can prove who they are and nothing more.
  if (!staff || !staff.is_active) {
    return {
      status: 'NO_MEMBERSHIP',
      authUserId,
      displayName: staff?.display_name ?? null,
    }
  }

  const { data: memberships } = await db
    .from('clinic_memberships')
    .select('clinic_id, role, clinics(name, timezone)')
    .eq('user_id', staff.id)
    .eq('is_active', true)

  const options: ClinicOption[] = (memberships ?? []).map((row) => {
    // The join is typed as possibly-absent; a membership whose clinic row is
    // unreadable is still a real membership, so it is labelled rather than
    // dropped.
    const clinic = row.clinics as { name: string; timezone: string } | null

    return {
      clinicId: row.clinic_id,
      role: row.role,
      clinicName: clinic?.name ?? 'Unnamed clinic',
      clinicTimezone: clinic?.timezone ?? FALLBACK_TIME_ZONE,
    }
  })

  if (options.length === 0) {
    return { status: 'NO_MEMBERSHIP', authUserId, displayName: staff.display_name }
  }

  const chosen = await selectClinic(options)
  if (!chosen) {
    return {
      status: 'CLINIC_CHOICE_REQUIRED',
      authUserId,
      displayName: staff.display_name,
      options,
    }
  }

  return {
    status: 'ACTIVE',
    actor: {
      kind: 'STAFF',
      staffUserId: staff.id,
      authUserId,
      clinicId: chosen.clinicId,
      clinicTimezone: chosen.clinicTimezone,
      clinicName: chosen.clinicName,
      role: chosen.role,
      displayName: staff.display_name,
      // Correlates every audit row written while handling this request.
      requestId: crypto.randomUUID(),
    },
  }
})

/**
 * Pick the clinic this request acts in.
 *
 * With one membership there is nothing to choose. With several, the cookie is
 * consulted — but only as a *hint*: the value is matched against memberships
 * read from the database, so a tampered cookie naming another clinic selects
 * nothing rather than granting access to it.
 */
async function selectClinic(options: readonly ClinicOption[]): Promise<ClinicOption | null> {
  if (options.length === 1) return options[0] ?? null

  const store = await cookies()
  const preferred = store.get(CLINIC_COOKIE)?.value
  if (!preferred) return null

  return options.find((option) => option.clinicId === preferred) ?? null
}

/** Name of the cookie recording a clinic choice, for the action that sets it. */
export const clinicCookieName = CLINIC_COOKIE
