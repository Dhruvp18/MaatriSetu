/**
 * Patient voice queries.
 *
 * Three unions carry the safety properties, and each exists because the
 * nullable alternative collapses a distinction that matters:
 *
 *   `PatientAssociation` — a message from an unrecognised number has no
 *   patient, and one from a number shared by two mothers has a *choice*, not an
 *   answer. Modelling this as `patientId: string | null` would lose the
 *   difference between "nobody" and "we cannot tell which of these two", and
 *   attaching clinical content to the wrong mother is the incident this whole
 *   design exists to prevent.
 *
 *   `Processing` — a transcription that failed is FAILED, and carries no text
 *   to read. It is never defaulted to an empty transcript, because an empty
 *   transcript in a queue reads as a message with nothing in it.
 *
 *   `RoutingBucket` — how urgently a human should read this. Not a triage
 *   level, not a risk score, not a clinical assessment.
 */

import type { RoutingBucket } from './triage-lexicon'

export type { RoutingBucket }

export type VoiceChannel = 'WHATSAPP' | 'IN_APP_UPLOAD' | 'OTHER'

/** A patient this message might belong to, when the number is shared. */
export interface AssociationCandidate {
  readonly patientId: string
  readonly fullName: string
  readonly uhid: string
}

export type PatientAssociation =
  | { readonly kind: 'VERIFIED'; readonly patientId: string; readonly contactId: string | null }
  | { readonly kind: 'AMBIGUOUS'; readonly candidates: readonly AssociationCandidate[] }
  | { readonly kind: 'UNMATCHED' }

export type Processing =
  /** Received, queued, or in flight. No text yet, and that is not a failure. */
  | { readonly state: 'PENDING'; readonly stage: 'RECEIVED' | 'QUEUED' | 'TRANSCRIBING' }
  | {
      readonly state: 'READY'
      readonly original: string
      /** Empty when translation failed but her own words came through. */
      readonly english: string
      readonly detectedLanguage: string | null
      /** Provider-reported, shown as uncertainty. Never gates anything. */
      readonly confidence: number | null
      readonly provider: string
      /** True when the text came from canned fixtures, not a real model. */
      readonly isFixture: boolean
    }
  | { readonly state: 'FAILED'; readonly error: string }

export interface VoiceQuery {
  readonly id: string
  readonly channel: VoiceChannel
  readonly association: PatientAssociation
  readonly processing: Processing
  readonly audioObjectKey: string | null
  readonly audioDurationSeconds: number | null
  readonly fromPhoneE164: string | null

  /** Null until processing succeeds — an unread message has no routing. */
  readonly routingBucket: RoutingBucket | null
  readonly matchedPhrases: readonly string[]
  readonly lexiconVersion: string | null

  readonly acknowledgedBy: string | null
  readonly acknowledgedAt: string | null
  readonly resolvedAt: string | null
  readonly resolvedInVisitId: string | null

  readonly receivedAt: string
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How a routing bucket should read to a clinician.
 *
 * Centralised so no screen invents wording that sounds like a diagnosis.
 * "Needs a clinician" rather than "possible pre-eclampsia".
 */
export function describeRouting(bucket: RoutingBucket | null): string {
  switch (bucket) {
    case 'PRIORITY_REVIEW':
      return 'Read first'
    case 'NEEDS_REVIEW':
      return 'Needs a clinician'
    case 'INFORMATIONAL':
      return 'Routine question'
    case null:
      return 'Not yet processed'
  }
}

/** Whether this message is still waiting for a clinician to look at it. */
export function isOutstanding(query: VoiceQuery): boolean {
  return query.resolvedAt === null
}
