/**
 * The application's error taxonomy.
 *
 * Every failure crossing a service boundary is one of these. Two rules shape
 * the design:
 *
 *   1. An error message that reaches a browser must never leak whether a record
 *      exists. `forbidden()` and `notFound()` both surface as 404, so probing
 *      a UUID cannot reveal that a patient is registered at another clinic.
 *
 *   2. A retryable failure must be distinguishable from a permanent one, so the
 *      UI can offer "try again" rather than discarding a clinician's draft.
 */

export type AppErrorKind =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'RETRYABLE'
  | 'INTERNAL'

interface AppErrorOptions {
  /** Structured detail safe to show the user, e.g. per-field validation messages. */
  readonly details?: unknown
  /** Underlying cause, logged but never serialized to a client. */
  readonly cause?: unknown
  /** Stable machine-readable code for the UI to branch on. */
  readonly code?: string
}

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly details?: unknown
  readonly code?: string

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.kind = kind
    this.details = options.details
    this.code = options.code
  }

  /** Whether the caller may usefully retry the same request unchanged. */
  get isRetryable(): boolean {
    return this.kind === 'RETRYABLE'
  }
}

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

export const unauthenticated = (message = 'Sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message)

/**
 * The caller is authenticated but not permitted.
 *
 * Note this is mapped to 404 at the HTTP boundary — see `httpStatusFor`.
 */
export const forbidden = (message = 'You do not have access to this record.') =>
  new AppError('FORBIDDEN', message)

export const notFound = (message = 'Record not found.') => new AppError('NOT_FOUND', message)

export const validation = (message: string, details?: unknown) =>
  new AppError('VALIDATION', message, { details })

/**
 * The record changed underneath the caller (optimistic-concurrency failure), or
 * an idempotency key was reused with different content.
 *
 * The UI response is to refresh and reconcile — never to discard the draft.
 */
export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, { details })

/** A required precondition is unmet, e.g. saving a visit that is already saved. */
export const preconditionFailed = (message: string, details?: unknown) =>
  new AppError('PRECONDITION_FAILED', message, { details })

/** A transient failure. The caller may retry the identical request. */
export const retryable = (message: string, cause?: unknown) =>
  new AppError('RETRYABLE', message, { cause })

export const internal = (message = 'Something went wrong.', cause?: unknown) =>
  new AppError('INTERNAL', message, { cause })

/* -------------------------------------------------------------------------- */
/* HTTP mapping                                                               */
/* -------------------------------------------------------------------------- */

export function httpStatusFor(error: AppError): number {
  switch (error.kind) {
    case 'UNAUTHENTICATED':
      return 401
    // Deliberately 404, not 403. Distinguishing "forbidden" from "not found"
    // tells an attacker which record identifiers are real.
    case 'FORBIDDEN':
      return 404
    case 'NOT_FOUND':
      return 404
    case 'VALIDATION':
      return 422
    case 'CONFLICT':
      return 409
    case 'PRECONDITION_FAILED':
      return 412
    case 'RETRYABLE':
      return 503
    case 'INTERNAL':
      return 500
  }
}

/** The shape sent to clients. Never includes `cause` or a stack trace. */
export interface SerializedError {
  readonly error: {
    readonly kind: AppErrorKind
    readonly message: string
    readonly code?: string
    readonly details?: unknown
    readonly retryable: boolean
  }
}

export function serializeError(error: unknown): SerializedError {
  const appError =
    error instanceof AppError
      ? error
      : // An unexpected throw must not surface its message: it may contain a
        // connection string, a row's contents, or a provider's echo of PHI.
        internal('Something went wrong.', error)

  return {
    error: {
      kind: appError.kind,
      message: appError.message,
      ...(appError.code !== undefined ? { code: appError.code } : {}),
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      retryable: appError.isRetryable,
    },
  }
}
