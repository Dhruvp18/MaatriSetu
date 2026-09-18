import { forbidden, unauthenticated } from '@core/errors/app-error'

import { type ClinicRole, type Permission, roleHasPermission } from './permissions'

/**
 * Who is acting, in which clinic, with what authority.
 *
 * Every service function takes this as its first argument (ARCH-5). Passing it
 * explicitly rather than reading an ambient session has three consequences that
 * matter here:
 *
 *   - A service is callable from a route handler, a worker job or a test with
 *     no difference in how authorization behaves.
 *   - There is no "current user" global that a background job could accidentally
 *     inherit from whichever request happened to run last.
 *   - The worker must construct a `WorkerActor`, which cannot hold clinical
 *     permissions — so elevated database access cannot drift into clinical
 *     authority (see CLINICIAN_ONLY_PERMISSIONS).
 */

/** A signed-in member of staff acting within one clinic. */
export interface StaffActor {
  readonly kind: 'STAFF'
  readonly staffUserId: string
  readonly authUserId: string
  readonly clinicId: string
  /**
   * IANA zone of the clinic being acted in, e.g. `Asia/Kolkata`.
   *
   * Carried on the actor because gestational age is a *calendar* computation.
   * Deriving "today" from the server clock shifts the displayed POG by a day
   * for several hours each night in IST, and near a milestone boundary — the
   * anomaly-scan window, the steroid window — that day decides what a clinician
   * orders. It belongs to the clinic, not to the server or the browser.
   */
  readonly clinicTimezone: string
  readonly role: ClinicRole
  readonly displayName: string
  /** Correlates every row written while handling one request. */
  readonly requestId: string
}

/**
 * A background job. Holds NO permissions.
 *
 * The worker writes extraction results and delivers outbound messages. It may
 * propose; it may never verify, prescribe, save a consultation or issue a
 * referral. `requirePermission` rejects every check for this actor, so the only
 * way a worker can write clinical data is through a repository call that was
 * deliberately written to accept it.
 */
export interface WorkerActor {
  readonly kind: 'WORKER'
  readonly worker: string
  readonly clinicId: string
  /** See `StaffActor.clinicTimezone`. A job dates its work by the clinic too. */
  readonly clinicTimezone: string
  readonly requestId: string
}

export type ActorContext = StaffActor | WorkerActor

export const isStaff = (actor: ActorContext): actor is StaffActor => actor.kind === 'STAFF'

/**
 * Assert the actor may perform this operation in their own clinic.
 *
 * Throws `FORBIDDEN`, which the HTTP layer renders as 404 so that probing an
 * identifier cannot reveal whether a record exists elsewhere.
 */
export function requirePermission(actor: ActorContext, permission: Permission): asserts actor is StaffActor {
  if (!isStaff(actor)) {
    throw forbidden(`A background job may not perform "${permission}".`)
  }

  if (!roleHasPermission(actor.role, permission)) {
    throw forbidden(`Your role (${actor.role}) does not permit "${permission}".`)
  }
}

/**
 * Assert the actor is operating inside the tenant they belong to.
 *
 * Belt and braces alongside the composite foreign keys and RLS: a service that
 * receives a clinic id from a request must never trust it over the one on the
 * session.
 */
export function requireSameClinic(actor: ActorContext, clinicId: string): void {
  if (actor.clinicId !== clinicId) {
    throw forbidden('That record belongs to another clinic.')
  }
}

/** Assert there is a signed-in human. Use before permission-free reads. */
export function requireStaff(actor: ActorContext): asserts actor is StaffActor {
  if (!isStaff(actor)) throw unauthenticated('This action requires a signed-in user.')
}
