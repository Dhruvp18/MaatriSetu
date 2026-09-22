'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import type { ReferralLink } from '@modules/referrals/referral.types'

import { createReferralLink, type LinkState, revokeReferralLink } from './actions'

/**
 * The link a receiving unit opens.
 *
 * The QR is the whole handover mechanism for a doctor who has never heard of
 * this system: they point a phone at a printed square and read the same
 * document the slip shows, with no account and no app.
 *
 * Everything in here is built around the raw token existing exactly once. It is
 * shown in this response and nowhere else — not in the list below, not in the
 * audit log, not in the database, which holds only its hash. The copy says so
 * plainly, because a nurse who closes this panel expecting to find the link
 * again has lost it.
 */

const initialState: LinkState = { status: 'idle' }

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  )
}

export function LinkPanel({
  patientId,
  referralId,
  links,
  now,
}: {
  patientId: string
  referralId: string
  links: readonly ReferralLink[]
  /** Server-rendered instant, so "expired" is decided on one clock. */
  now: string
}) {
  const [state, formAction] = useActionState(createReferralLink, initialState)

  const nowMs = new Date(now).getTime()

  return (
    <div className="space-y-5">
      {state.status === 'created' ? (
        <div className="rounded-lg border-2 border-brand-600 p-4 print:rounded-none print:border print:border-black print:p-2">
          {/*
            Deliberately NOT marked `no-print`, and deliberately not isolated
            the way the file sticker is. This block belongs on the printed
            sheet, beside the slip: one press of Print then produces the whole
            artefact that travels with the patient. Isolating it would print the
            code alone and leave the document behind.
          */}
          <div className="print-keep flex items-center gap-4">
            <div
              className="aspect-square w-[34mm] shrink-0 bg-white [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by the `qrcode` package from a token we
              // minted; not user input.
              dangerouslySetInnerHTML={{ __html: state.qrSvg }}
            />
            <p className="text-xs leading-snug text-slate-700 print:text-black">
              Scan for the full referral. No sign-in is needed. The link stops
              working after{' '}
              <span className="numeric">{new Date(state.expiresAt).toLocaleString()}</span>, or
              sooner if the referring clinic revokes it.
            </p>
          </div>

          <p className="no-print mt-3 text-sm font-medium text-alert-700">
            Print or copy it now — it cannot be shown again. A lost link is
            replaced, not recovered.
          </p>
          <p className="no-print numeric mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs break-all text-slate-700">
            {state.url}
          </p>
        </div>
      ) : (
        <form action={formAction} className="no-print">
          <p className="mb-3 text-sm text-slate-600">
            A link lets the receiving unit read this exact document on a phone,
            with no account. It is short-lived and can be revoked.
          </p>
          <input type="hidden" name="referralId" value={referralId} />
          <Pending idle="Create a link" busy="Creating…" />
          {state.status === 'error' ? (
            <p role="alert" className="mt-3 text-sm text-alert-700">
              {state.message}
            </p>
          ) : null}
        </form>
      )}

      {links.length > 0 ? (
        <div className="no-print">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Links issued
          </h3>
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="numeric text-slate-600">
                  {/*
                    No token, no hash, not even a prefix. Nothing that could be
                    used to reconstruct a working link ever reaches this list.
                  */}
                  {describeLink(link, nowMs)}
                </span>
                {link.revokedAt === null && new Date(link.expiresAt).getTime() > nowMs ? (
                  <RevokeButton patientId={patientId} referralId={referralId} tokenId={link.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function describeLink(link: ReferralLink, nowMs: number): string {
  const created = new Date(link.createdAt).toLocaleString()
  if (link.revokedAt !== null) return `${created} — revoked`
  if (new Date(link.expiresAt).getTime() <= nowMs) return `${created} — expired`
  return `${created} — live until ${new Date(link.expiresAt).toLocaleString()}`
}

function RevokeButton({
  patientId,
  referralId,
  tokenId,
}: {
  patientId: string
  referralId: string
  tokenId: string
}) {
  const [state, formAction] = useActionState(revokeReferralLink, initialState)

  return (
    <form action={formAction}>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="referralId" value={referralId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <button
        type="submit"
        className="rounded-lg border border-alert-600/40 px-3 py-1.5 text-xs font-medium text-alert-700 transition hover:bg-alert-50"
      >
        Revoke
      </button>
      {state.status === 'error' ? (
        <span role="alert" className="ml-2 text-xs text-alert-700">
          {state.message}
        </span>
      ) : null}
    </form>
  )
}
