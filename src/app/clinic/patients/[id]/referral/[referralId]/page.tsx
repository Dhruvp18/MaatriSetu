import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { formatClinicDateTime } from '@core/time/clinic-time'
import { ReferralSlip } from '@components/referral/referral-slip'
import { getReferral, listLinks } from '@modules/referrals/referral.service'
import { issuedSnapshot, type Referral } from '@modules/referrals/referral.types'

import { LinkPanel } from './link-panel'
import { PrintButton } from './print-button'

/**
 * An issued referral: the print view.
 *
 * Renders `ReferralSlip` from the frozen snapshot — the same component, from
 * the same blob, as the public page at `/referral/[token]`. That is the whole
 * reason the snapshot exists: a printed slip contradicting the QR code beside
 * it leaves a receiving unit deciding which of two documents to believe about a
 * patient they have never seen.
 *
 * There is no edit control on this page and no route that provides one. A
 * correction is a new referral that supersedes this one, and the link for that
 * is at the foot of the page.
 *
 * The QR sits inside the printed region on purpose. One press of Print should
 * produce the complete artefact that travels with the patient — paper for the
 * people reading it in the ambulance, a code for the unit that would rather
 * scroll it on a phone.
 */

export const metadata = { title: 'Referral slip' }
export const dynamic = 'force-dynamic'

export default async function IssuedReferralPage({
  params,
}: {
  params: Promise<{ id: string; referralId: string }>
}) {
  const { id, referralId } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    redirect(`/sign-in?next=/clinic/patients/${id}/referral/${referralId}`)
  }

  const { actor } = session

  if (!roleHasPermission(actor.role, 'referral.read')) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) cannot open a referral.
          </p>
        </section>
      </main>
    )
  }

  let referral: Referral
  try {
    referral = await getReferral(actor, referralId)
  } catch (error) {
    // The service answers identically for "does not exist" and "belongs to
    // another clinic", so this leaks nothing either way.
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  const snapshot = issuedSnapshot(referral)

  // A draft has no document to print. Back to the form is the only useful
  // answer to the request.
  if (snapshot === null) redirect(`/clinic/patients/${id}/referral`)

  const document = referral.document
  const superseded = document.state === 'SUPERSEDED'

  const canShare = !superseded && roleHasPermission(actor.role, 'referral.issue_token')
  const links = canShare ? await listLinks(actor, referralId) : []

  const now = new Date()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/clinic/patients/${id}/referral`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Referrals
        </Link>
        <span className="numeric text-xs text-slate-500">
          Issued {formatClinicDateTime(snapshot.issuedAt, snapshot.timeZone)}
        </span>
      </div>

      {document.state === 'SUPERSEDED' ? (
        <p className="no-print mb-4 rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
          This referral was replaced on{' '}
          {formatClinicDateTime(document.supersededAt, snapshot.timeZone)}. It is kept exactly as
          it was handed over, and its links no longer open. Print the replacement instead.
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white print:rounded-none print:border-0">
        <ReferralSlip snapshot={snapshot} now={now} />
      </div>

      <div className="no-print mt-6 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Print
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            The paper slip travels with the patient. It prints black on white on
            A4 and is never clipped to fit — a slip that silently dropped the
            last two administered doses would be a redosing risk.
          </p>
          <PrintButton />
        </section>
      </div>

      {/*
        Outside the `no-print` block above, because a freshly minted QR belongs
        on the printed sheet. Everything inside the panel except the code itself
        marks itself `no-print`.
      */}
      {canShare ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 print:mt-4 print:rounded-none print:border-0 print:p-0">
          <h2 className="no-print mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Link for the receiving unit
          </h2>
          <LinkPanel
            patientId={id}
            referralId={referralId}
            links={links}
            now={now.toISOString()}
          />
        </section>
      ) : null}

      {!superseded && roleHasPermission(actor.role, 'referral.draft') ? (
        <section className="no-print mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Correction
          </h2>
          <p className="mb-3 text-sm leading-relaxed text-slate-600">
            This document cannot be edited. A copy of it is already with the
            patient, and changing what is on file here would leave the two
            disagreeing. A correction is issued as a new referral that replaces
            this one; the original stays on the record, and its links stop
            working the moment the replacement is issued.
          </p>
          <Link
            href={`/clinic/patients/${id}/referral?supersedes=${referralId}`}
            className="inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Issue a corrected referral
          </Link>
        </section>
      ) : null}
    </main>
  )
}
