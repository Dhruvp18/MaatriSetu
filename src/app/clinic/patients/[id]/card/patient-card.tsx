'use client'

import { Download, HeartPulse, Printer, QrCode } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { issueSticker, type StickerState } from '../actions'

/**
 * The printable patient card.
 *
 * The QR can only be shown in the response that mints it — the token is stored
 * as a hash (migration 0013) — so the card is generated, printed, and then gone
 * from the screen. Printing again means issuing again, which retires the
 * previous card and sticker; the page says so before anyone presses the button.
 *
 * "Download" is the browser's own Save as PDF from the print dialog: the card is
 * laid out at A6 so the same markup prints on a card printer or on A4.
 */

interface CardDetails {
  readonly fullName: string
  readonly uhid: string
  readonly age: string | null
  readonly phone: string | null
  readonly bloodGroup: string | null
  readonly lmp: string | null
  readonly edd: string | null
  readonly gpla: string | null
  readonly nextVisit: string | null
  readonly issuedOn: string
}

const initial: StickerState = { status: 'idle' }

function GenerateButton({ replacing }: { replacing: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
    >
      <QrCode aria-hidden className="h-4.5 w-4.5" />
      {pending ? 'Generating…' : replacing ? 'Generate new card' : 'Generate patient card'}
    </button>
  )
}

export function PatientCardPanel({
  patientId,
  canIssue,
  hasActiveQrToken,
  details,
}: {
  patientId: string
  canIssue: boolean
  hasActiveQrToken: boolean
  details: CardDetails
}) {
  const [state, action] = useActionState(issueSticker, initial)

  if (state.status !== 'issued') {
    return (
      <section className="glass flex flex-col gap-3 rounded-xl border border-slate-200 p-5">
        <h1 className="font-heading text-lg font-bold text-slate-900">Patient card · {details.fullName}</h1>
        <p className="text-sm text-slate-600">
          A card she keeps and brings to every visit. Its QR opens her file in one scan here; it carries no
          name or clinical detail of its own, and works only for staff signed in at this clinic.
        </p>
        {hasActiveQrToken ? (
          <p className="rounded-lg border border-caution-200 bg-caution-50 px-3 py-2 text-xs text-caution-900">
            She already has a working card or file sticker. Generating a new card stops the old QR working —
            do it when the card is lost, or at registration.
          </p>
        ) : null}
        {canIssue ? (
          <form action={action}>
            <input type="hidden" name="patientId" value={patientId} />
            <GenerateButton replacing={hasActiveQrToken} />
          </form>
        ) : (
          <p className="text-sm text-slate-500">Your role cannot issue patient cards.</p>
        )}
        {state.status === 'error' ? (
          <p role="alert" className="text-sm text-alert-700">
            {state.message}
          </p>
        ) : null}
      </section>
    )
  }

  const rows: Array<[string, string | null]> = [
    ['UHID', details.uhid],
    ['Age', details.age],
    ['Phone', details.phone],
    ['Blood group', details.bloodGroup],
    ['LMP', details.lmp],
    ['EDD', details.edd],
    ['Obstetric', details.gpla],
    ['Next visit', details.nextVisit],
  ]

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="no-print flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-verified-200 bg-verified-50 px-4 py-3">
        <p className="text-sm text-verified-700">
          Card generated. Print it now — the QR cannot be shown again after you leave this page.
          {state.replacedPrevious ? ' Her previous card and sticker no longer work.' : ''}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-1.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            <Printer aria-hidden className="h-4 w-4" /> Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Choose “Save as PDF” in the print dialog"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download aria-hidden className="h-4 w-4" /> Download PDF
          </button>
        </div>
      </div>

      {/* `print-slip` isolates this on paper (globals.css). A6: 105 × 148 mm. */}
      <article className="print-slip w-[105mm] overflow-hidden rounded-xl border-2 border-brand-800 bg-white text-slate-900 shadow-md">
        <header className="flex items-center justify-between bg-brand-800 px-4 py-2.5 text-white">
          <span className="flex items-center gap-1.5 font-heading text-sm font-extrabold tracking-wide">
            <HeartPulse aria-hidden className="h-4.5 w-4.5" />
            MaatriSetu
          </span>
          <span className="text-[10px] font-semibold tracking-wider uppercase">Antenatal card</span>
        </header>

        <div className="flex gap-3 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base leading-tight font-bold">{details.fullName}</p>
            <dl className="numeric mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex w-[32mm] shrink-0 flex-col items-center">
            <div
              className="aspect-square w-full border border-slate-200 p-1 [&>svg]:h-full [&>svg]:w-full"
              // Generated server-side by `qrcode` from a token we minted; not user input.
              dangerouslySetInnerHTML={{ __html: state.qrSvg }}
            />
            <span className="mt-1 text-center text-[8px] leading-tight text-slate-500">Scan at the clinic desk</span>
          </div>
        </div>

        <footer className="mt-3 border-t border-slate-200 px-4 py-2 text-[9px] leading-snug text-slate-600">
          Bring this card, and all your reports, to every visit. In an emergency, show it at any hospital.
          <span className="numeric mt-0.5 block text-slate-400">Issued {details.issuedOn}</span>
        </footer>
      </article>
    </div>
  )
}
