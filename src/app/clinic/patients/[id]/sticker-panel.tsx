'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { issueSticker, type StickerState } from './actions'

/**
 * Issue and print the file sticker.
 *
 * The sticker is the product's front door: it is what turns a paper file into
 * a one-second lookup. What it encodes is an opaque random token and nothing
 * else — no name, no UHID, no patient id — so a sticker photographed across a
 * waiting room reveals nothing, and it only resolves for an authenticated user
 * of this clinic.
 */

const initialState: StickerState = { status: 'idle' }

function IssueButton({ replacing }: { replacing: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Issuing…' : replacing ? 'Issue replacement sticker' : 'Issue file sticker'}
    </button>
  )
}

export function StickerPanel({
  patientId,
  hasActiveQrToken,
}: {
  patientId: string
  hasActiveQrToken: boolean
}) {
  const [state, formAction] = useActionState(issueSticker, initialState)

  if (state.status === 'issued') {
    return (
      <div>
        {state.replacedPrevious ? (
          <p className="no-print mb-3 rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
            The previous sticker for this file has stopped working. Remove it so
            the old one cannot be scanned by mistake.
          </p>
        ) : null}

        {/*
          The printable artefact. Sized in millimetres rather than pixels
          because it is cut out and stuck on a file: 25mm square is the 1x1 inch
          the PRD specifies, and `print-sticker` isolates it so the surrounding
          page is not printed with it.
        */}
        <div className="print-sticker mx-auto w-[25mm] border border-slate-300 bg-white p-[1.5mm] text-center">
          <div
            className="mx-auto aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
            // Generated server-side by the `qrcode` package from a token we
            // minted; not user input.
            dangerouslySetInnerHTML={{ __html: state.qrSvg }}
          />
          <p className="numeric mt-[1mm] text-[5pt] leading-tight break-all text-black">
            {state.uhid}
          </p>
        </div>

        <div className="no-print mt-4 space-y-3">
          <p className="text-sm text-slate-600">
            Sticker issued for <span className="font-medium">{state.fullName}</span>.
            Print it now — the code cannot be shown again, and a lost sticker is
            replaced rather than recovered.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Print sticker
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="no-print">
      {hasActiveQrToken ? (
        <p className="mb-3 text-sm text-slate-600">
          This file already has a working sticker. Issue a replacement only if it
          is lost or unreadable — doing so stops the old one working.
        </p>
      ) : (
        <p className="mb-3 text-sm text-slate-600">
          No sticker has been issued for this file yet.
        </p>
      )}

      <form action={formAction}>
        <input type="hidden" name="patientId" value={patientId} />
        <IssueButton replacing={hasActiveQrToken} />
      </form>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2 text-sm text-alert-700"
        >
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
