import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ReferralSlip } from '@components/referral/referral-slip'
import { openReferralByToken } from '@modules/referrals/referral.service'

/**
 * The page a receiving doctor opens at 2 AM.
 *
 * ---------------------------------------------------------------------------
 * What is different about this page
 * ---------------------------------------------------------------------------
 * There is no session and there never will be. The reader has no account at
 * this clinic, no app, and no time — they have pointed a phone at a QR code on
 * a piece of paper that arrived with a patient. The token in the URL is the
 * entire access mechanism, and everything that makes that safe lives in
 * `openReferralByToken`: hashed storage, expiry, revocation, and an access log
 * written in the same transaction that returns the document.
 *
 * ---------------------------------------------------------------------------
 * It renders the frozen snapshot and nothing else
 * ---------------------------------------------------------------------------
 * The same `ReferralSlip` component as the print view, from the same blob. Not
 * a query against the patient's record — there is no path from this page to
 * one, by construction. If a clinician corrects her haemoglobin at 09:00, this
 * page still shows what the receiving unit was actually handed at 02:00, which
 * is the only thing it can honestly claim to show.
 *
 * ---------------------------------------------------------------------------
 * Every refusal looks the same
 * ---------------------------------------------------------------------------
 * Expired, revoked and never-existed produce one identical page. Saying "this
 * link has expired" would confirm to whoever is holding a guessed token that
 * the token was real. The service cannot tell the three apart either; only the
 * access log knows.
 */

/**
 * `robots` is set again here even though the root layout already denies
 * indexing. This is the one route in the application that is reachable without
 * a session, so it is the one route where relying on an inherited default is
 * not good enough — a patient's handover document must never be crawlable, and
 * that guarantee should be readable in this file.
 */
export const metadata: Metadata = {
  title: 'Referral',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    googleBot: { index: false, follow: false, noimageindex: true, nosnippet: true },
  },
  // No Open Graph, no Twitter card. A messaging app that unfurled this link
  // would fetch the page and put a patient's name in a chat preview.
}

/**
 * Never cached, never prerendered.
 *
 * `Cache-Control: no-store` is additionally set for `/referral/:token` in
 * `next.config.ts`, where it applies to the HTTP response itself rather than to
 * Next's own data cache. Both are needed: this document must not sit in a CDN,
 * a corporate proxy or a shared phone's back-forward cache after the link has
 * been revoked.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PublicReferralPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const requestHeaders = await headers()

  const access = await openReferralByToken(token, {
    // First hop in the forwarded chain. Hashed inside the service and salted
    // with the token, so it can answer "is this the same reader coming back"
    // without keeping a network identifier beside health data.
    clientIp:
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      requestHeaders.get('x-real-ip') ??
      null,
    userAgent: requestHeaders.get('user-agent'),
  })

  if (access.outcome === 'DENIED') return <Unavailable />

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl bg-white shadow-sm print:rounded-none print:shadow-none">
          <ReferralSlip snapshot={access.snapshot} now={new Date()} />
        </div>

        <p className="no-print mx-auto mt-4 max-w-prose px-2 text-center text-xs leading-relaxed text-slate-500">
          This is a copy of the handover document as it was issued. It does not
          change, and it is not a live view of the patient&rsquo;s record. The
          link expires, and the referring clinic can withdraw it. Every opening
          of this page is recorded.
        </p>
      </div>
    </main>
  )
}

/**
 * One page for expired, revoked and unknown.
 *
 * It deliberately does not say which. It also gives the reader the only thing
 * that actually helps at 2 AM — ring the referring clinic, whose number is on
 * the paper in their hand — rather than an instruction to request a new link
 * from a system they have no account on.
 */
function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="max-w-sm rounded-xl bg-white p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">This link is not available</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Referral links are short-lived and can be withdrawn by the clinic that
          issued them.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          The referring clinic&rsquo;s telephone number is printed on the paper
          slip that came with the patient. Ring them.
        </p>
      </div>
    </main>
  )
}
