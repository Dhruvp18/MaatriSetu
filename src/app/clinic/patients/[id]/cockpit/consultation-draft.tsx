'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Decisions a doctor makes at the top of the cockpit that commit at the bottom.
 *
 * The diagnostic-reports panel sits directly under the patient banner, where
 * the doctor reads it first; Save & Next sits at the end of the page. Flagging a
 * report, marking one reviewed, and marking a patient's question addressed are
 * all made up there — and all of them commit inside the one atomic consultation
 * save, never on their own (migration 0018's header explains why a separate
 * endpoint would let them survive a failed save).
 *
 * This context is how the two ends meet. Nothing in it is written anywhere
 * until the form is submitted; reloading the page discards it, which is the
 * honest outcome for a decision nobody saved.
 */

/** What the doctor decided about one uploaded report. */
export type ReportDecision = 'FLAG' | 'REVIEWED'

/** One value read off a report, offered for verification. */
export interface ReportValue {
  readonly candidateId: string
  readonly correctionVersion: number
  readonly label: string
  readonly value: string
  readonly printedRange: string | null
  /** Against the range printed on the slip. Never "abnormal" (PRD §3). */
  readonly outsidePrintedRange: boolean | null
  readonly confidence: number | null
  readonly defaultCategory: string
}

/** One uploaded report awaiting the doctor, as the cockpit shows it. */
export interface PendingReport {
  readonly uploadId: string
  /** The stored file's type — image or PDF — for showing the original. */
  readonly contentType: string
  readonly title: string
  /** Short name for the one-line summary, e.g. `CBC`. */
  readonly shortTitle: string
  readonly kind: 'LAB' | 'SCAN'
  readonly date: string
  readonly status: 'READY' | 'NOT_STARTED' | 'IN_PROGRESS' | 'FAILED'
  readonly statusNote: string | null
  readonly fromFixture: boolean
  readonly values: readonly ReportValue[]
}

interface Draft {
  readonly decisions: Readonly<Record<string, ReportDecision>>
  readonly addressedQueryIds: ReadonlySet<string>
  decide(uploadId: string, decision: ReportDecision | null): void
  setAddressed(queryId: string, addressed: boolean): void
}

const DraftContext = createContext<Draft | null>(null)

export function ConsultationDraftProvider({ children }: { children: React.ReactNode }) {
  const [decisions, setDecisions] = useState<Record<string, ReportDecision>>({})
  const [addressedQueryIds, setAddressedQueryIds] = useState<ReadonlySet<string>>(new Set())

  const decide = useCallback((uploadId: string, decision: ReportDecision | null) => {
    setDecisions((current) => {
      const next = { ...current }
      if (decision === null) delete next[uploadId]
      else next[uploadId] = decision
      return next
    })
  }, [])

  const setAddressed = useCallback((queryId: string, addressed: boolean) => {
    setAddressedQueryIds((current) => {
      const next = new Set(current)
      if (addressed) next.add(queryId)
      else next.delete(queryId)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ decisions, addressedQueryIds, decide, setAddressed }),
    [decisions, addressedQueryIds, decide, setAddressed],
  )

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useConsultationDraft(): Draft {
  const draft = useContext(DraftContext)
  if (!draft) throw new Error('useConsultationDraft must be used inside ConsultationDraftProvider.')
  return draft
}

/**
 * The verification payload for the save, built from the doctor's decisions.
 *
 * Flagging a report verifies its values, records the doctor's flag, and pins
 * them to the significant-results accordions. Marking it reviewed verifies the
 * values without a flag and without a pin. Anything undecided stays a proposal
 * and is offered again next time — untouched is never read as "reviewed".
 */
export function verificationPayload(
  reports: readonly PendingReport[],
  decisions: Readonly<Record<string, ReportDecision>>,
) {
  return reports.flatMap((report) => {
    const decision = decisions[report.uploadId]
    if (!decision || report.status !== 'READY') return []

    return report.values.map((value) => ({
      candidateId: value.candidateId,
      correctionVersion: value.correctionVersion,
      category: value.defaultCategory,
      testName: value.label,
      // Sent only when actually flagged. `false` would record a clinician's
      // judgment that the value is unremarkable, which "reviewed" does not say.
      flagged: decision === 'FLAG' ? true : null,
      note: null,
      pin: decision === 'FLAG',
    }))
  })
}
