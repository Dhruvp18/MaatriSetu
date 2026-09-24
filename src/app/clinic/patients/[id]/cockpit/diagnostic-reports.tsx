'use client'

import {
  AudioLines,
  Camera,
  Check,
  ChevronDown,
  FileWarning,
  FlaskConical,
  Flag,
  Loader2,
  Maximize2,
  MessagesSquare,
  ScanLine,
  Undo2,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'

import {
  type PendingReport,
  type ReportDecision,
  useConsultationDraft,
} from './consultation-draft'
import { OriginalPreview } from './original-viewer'
import { uploadReportsAction } from './report-actions'

/**
 * Diagnostic reports for the current visit, directly under the patient banner.
 *
 * Every report read since the last consultation is laid out as a card, and the
 * doctor settles each one in a click: flag it to the significant labs or scans,
 * or mark it reviewed. Those decisions are staged here and commit with Save &
 * Next — see `consultation-draft.tsx`.
 *
 * ---------------------------------------------------------------------------
 * What is and is not coloured
 * ---------------------------------------------------------------------------
 * The reference screen prints "8.6 g/dL (Mild Anemia)" in red and "Nil (No
 * Proteinuria)" in green. Both are interpretations, and this product does not
 * make them (PRD §3). A value is shown as printed, with the slip's own range
 * and a neutral "outside lab range" marker when it falls outside it. It turns
 * red when — and because — the doctor flags it, and green when the doctor marks
 * it reviewed. The colour records a decision, never a classification.
 *
 * The patient-queries widget sits in the same strip: purple for questions still
 * to be addressed, green for those addressed.
 */

export interface QueryView {
  readonly id: string
  readonly receivedAt: string
  readonly state: 'READY' | 'PENDING' | 'FAILED'
  readonly original: string | null
  readonly english: string | null
  readonly error: string | null
  readonly routingLabel: string
  readonly isPriority: boolean
  readonly isFixture: boolean
  readonly resolvedAt: string | null
}

export function DiagnosticReports({
  reports,
  queries,
  canDecide,
  canAddress,
  blockedReason,
  upload,
}: {
  reports: readonly PendingReport[]
  queries: readonly QueryView[]
  /** Where uploads attach, or null when this role may not upload. */
  upload: { patientId: string; pregnancyId: string; visitId: string | null } | null
  /** The doctor can verify reports and there is an open visit to commit to. */
  canDecide: boolean
  canAddress: boolean
  /** Why buttons are unavailable, when they are. */
  blockedReason: string | null
}) {
  const { decisions } = useConsultationDraft()
  const [open, setOpen] = useState(true)
  const [queriesOpen, setQueriesOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detail, setDetail] = useState<PendingReport | null>(null)

  const pending = reports.filter((report) => !decisions[report.uploadId]).length

  const summary = reports
    .filter((report) => report.status === 'READY' && report.values.length > 0)
    .map((report) => {
      const first = report.values[0]
      return first ? `${report.shortTitle} (${first.label}: ${first.value})` : report.shortTitle
    })
    .join(', ')

  return (
    <section className="no-print glass overflow-hidden rounded-xl border border-caution-200/80 shadow-2xs">
      <div className="flex flex-col gap-2 bg-linear-to-r from-caution-50/90 via-white/60 to-violet-50/60 px-3.5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-left"
        >
          <ChevronDown
            aria-hidden
            className={`h-4.5 w-4.5 shrink-0 text-caution-700 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="font-heading text-xs font-bold text-caution-900 sm:text-sm">
            Diagnostic Reports for Current Visit
          </span>
          {reports.length > 0 ? (
            <span className="numeric rounded-full border border-caution-200 bg-caution-100 px-2 py-0.5 text-[10px] font-bold text-caution-900">
              {pending > 0 ? `${pending} Pending Doctor Review` : 'All reviewed — saves with consultation'}
            </span>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
              No new reports
            </span>
          )}
          {summary ? (
            <span className="numeric hidden min-w-0 truncate text-[11px] text-slate-600 md:inline">
              <span aria-hidden className="mr-1.5 text-slate-400">•</span>
              Summary: {summary}
            </span>
          ) : null}
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {upload ? (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-brand-800 shadow-2xs transition-colors hover:bg-brand-50"
            >
              <Upload aria-hidden className="h-3.5 w-3.5" />
              Upload reports / scans
            </button>
          ) : null}
          <QueriesWidget queries={queries} onOpen={() => setQueriesOpen(true)} />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="hidden text-[11px] font-semibold text-caution-700 hover:underline sm:inline"
          >
            {open ? 'Collapse' : 'Click to Expand / Review'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-caution-100 px-3.5 py-3">
          {reports.length === 0 ? (
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Nothing is waiting for review. If she has brought earlier reports or scans, photograph or
                upload them here — each one is read and then waits for you to flag it or mark it reviewed.
              </p>
              {upload ? (
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-brand-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                >
                  <Camera aria-hidden className="h-4 w-4" />
                  Add her existing reports
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {!canDecide && blockedReason ? (
                <p className="mb-2.5 text-[11px] text-slate-500">{blockedReason}</p>
              ) : null}
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <li key={report.uploadId}>
                    <ReportCard report={report} canDecide={canDecide} onOpen={() => setDetail(report)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      <ReportDetailModal report={detail} canDecide={canDecide} onClose={() => setDetail(null)} />
      {upload ? (
        <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} target={upload} />
      ) : null}

      <QueriesModal
        open={queriesOpen}
        onClose={() => setQueriesOpen(false)}
        queries={queries}
        canAddress={canAddress}
      />
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Report card                                                                */
/* -------------------------------------------------------------------------- */

function ReportCard({
  report,
  canDecide,
  onOpen,
}: {
  report: PendingReport
  canDecide: boolean
  onOpen: () => void
}) {
  const { decisions, decide } = useConsultationDraft()
  const decision = decisions[report.uploadId] ?? null
  const ready = report.status === 'READY' && report.values.length > 0

  const shell =
    decision === 'FLAG'
      ? 'border-alert-200 bg-alert-50/60'
      : decision === 'REVIEWED'
        ? 'border-verified-200 bg-verified-50/60'
        : 'border-slate-200 bg-white'

  return (
    <article className={`flex h-full flex-col gap-2 rounded-lg border p-3 shadow-2xs transition-colors ${shell}`}>
      <header className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          title="Open the report: every value read, and the original"
          className="group flex min-w-0 items-center gap-1.5 text-left"
        >
          {report.kind === 'SCAN' ? (
            <ScanLine aria-hidden className="h-4 w-4 shrink-0 text-diagnostic-600" />
          ) : (
            <FlaskConical aria-hidden className="h-4 w-4 shrink-0 text-brand-600" />
          )}
          <span className="font-heading truncate text-xs font-bold text-slate-900 group-hover:text-brand-800 group-hover:underline sm:text-[13px]">
            {report.title}
          </span>
          <Maximize2 aria-hidden className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-brand-700" />
        </button>
        <span className="numeric shrink-0 text-[10px] text-slate-500">{report.date}</span>
      </header>

      {ready ? (
        <dl
          className="numeric flex cursor-pointer flex-col gap-1 text-[11px]"
          onClick={onOpen}
          title="Open the report"
        >
          {report.values.slice(0, 5).map((value) => (
            <div key={value.candidateId} className="flex items-center justify-between gap-3">
              <dt className="min-w-0 truncate text-slate-600">{value.label}:</dt>
              <dd className="flex shrink-0 flex-col items-end">
                <span
                  className={`rounded px-1.5 py-0.5 font-bold ${
                    decision === 'FLAG'
                      ? 'border border-alert-200 bg-alert-50 text-alert-700'
                      : decision === 'REVIEWED'
                        ? 'border border-verified-200 bg-verified-50 text-verified-700'
                        : 'text-slate-900'
                  }`}
                >
                  {value.value}
                </span>
                {value.printedRange || value.outsidePrintedRange ? (
                  <span className="text-[9.5px] text-slate-400">
                    {value.printedRange ? `lab range ${value.printedRange}` : ''}
                    {value.outsidePrintedRange ? (
                      <span className="ml-1 font-semibold text-caution-700">outside</span>
                    ) : null}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
          {report.values.length > 5 ? (
            <dd className="text-[10.5px] font-semibold text-brand-700">+{report.values.length - 5} more — open report</dd>
          ) : null}
        </dl>
      ) : (
        <p className="flex items-start gap-1.5 text-[11px] text-slate-600">
          {report.status === 'FAILED' ? (
            <FileWarning aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caution-600" />
          ) : (
            <Loader2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
          )}
          <span>{report.statusNote}</span>
        </p>
      )}

      {report.fromFixture ? (
        <p className="rounded border border-caution-200 bg-caution-50 px-2 py-1 text-[10.5px] text-caution-700">
          Sample output — no image was read. Do not verify this as a real result.
        </p>
      ) : null}
      {ready && report.values.some((v) => v.confidence !== null && v.confidence < 0.7) ? (
        <p className="text-[10.5px] text-caution-700">
          Some values were read with low confidence. Check them against the slip.
        </p>
      ) : null}

      <div className="mt-auto pt-1">
        {!ready ? null : decision ? (
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span
              className={`flex items-center gap-1 font-semibold ${
                decision === 'FLAG' ? 'text-alert-700' : 'text-verified-700'
              }`}
            >
              {decision === 'FLAG' ? <Flag aria-hidden className="h-3.5 w-3.5" /> : <Check aria-hidden className="h-3.5 w-3.5" />}
              {decision === 'FLAG'
                ? `Flagged to significant ${report.kind === 'SCAN' ? 'scans' : 'labs'}`
                : 'Reviewed'}
              <span className="font-normal text-slate-500">· saves with consultation</span>
            </span>
            <button
              type="button"
              onClick={() => decide(report.uploadId, null)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <Undo2 aria-hidden className="h-3.5 w-3.5" />
              Undo
            </button>
          </div>
        ) : canDecide ? (
          <div className="grid grid-cols-2 gap-2">
            <DecisionButton
              tone="flag"
              onClick={() => decide(report.uploadId, 'FLAG')}
              label={`Flag to Significant ${report.kind === 'SCAN' ? 'Scans' : 'Labs'}`}
            />
            <DecisionButton tone="review" onClick={() => decide(report.uploadId, 'REVIEWED')} label="Mark Reviewed" />
          </div>
        ) : null}
      </div>
    </article>
  )
}

function DecisionButton({
  tone,
  label,
  onClick,
}: {
  tone: 'flag' | 'review'
  label: string
  onClick: () => void
}) {
  const styles =
    tone === 'flag'
      ? 'border-alert-200 bg-alert-50 text-alert-700 hover:bg-alert-100'
      : 'border-verified-200 bg-verified-50 text-verified-700 hover:bg-verified-100'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors ${styles}`}
    >
      [ {label} ]
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Report detail                                                              */
/* -------------------------------------------------------------------------- */

function ReportDetailModal({
  report,
  canDecide,
  onClose,
}: {
  report: PendingReport | null
  canDecide: boolean
  onClose: () => void
}) {
  const { decisions, decide } = useConsultationDraft()
  if (!report) return null

  const decision = decisions[report.uploadId] ?? null
  const ready = report.status === 'READY' && report.values.length > 0
  const act = (value: ReportDecision | null) => {
    decide(report.uploadId, value)
    if (value) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={report.title}
      subtitle={`${report.date} · ${
        ready ? `${report.values.length} value${report.values.length === 1 ? '' : 's'} read from the ${report.contentType === 'application/pdf' ? 'PDF' : 'photograph'}` : report.statusNote ?? ''
      }. Nothing here is in her record until you decide.`}
      footer={
        ready && canDecide ? (
          decision ? (
            <button
              type="button"
              onClick={() => act(null)}
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Undo2 aria-hidden className="h-3.5 w-3.5" /> Undo {decision === 'FLAG' ? 'flag' : 'review'}
            </button>
          ) : (
            <>
              <DecisionButton
                tone="flag"
                onClick={() => act('FLAG')}
                label={`Flag to Significant ${report.kind === 'SCAN' ? 'Scans' : 'Labs'}`}
              />
              <DecisionButton tone="review" onClick={() => act('REVIEWED')} label="Mark Reviewed" />
            </>
          )
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="font-heading text-[11px] font-bold tracking-wide text-slate-700 uppercase">
            Values read (OCR)
          </p>
          {report.fromFixture ? (
            <p className="rounded border border-caution-200 bg-caution-50 px-2 py-1 text-[11px] text-caution-700">
              Sample output — no image was read. These are not values from this document.
            </p>
          ) : null}
          {ready ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="numeric w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-2.5 py-1.5">Test (as printed)</th>
                    <th className="px-2.5 py-1.5">Value</th>
                    <th className="px-2.5 py-1.5">Lab range</th>
                    <th className="px-2.5 py-1.5 text-right">Read with</th>
                  </tr>
                </thead>
                <tbody>
                  {report.values.map((value) => (
                    <tr key={value.candidateId} className="border-t border-slate-100">
                      <td className="px-2.5 py-1.5 text-slate-700">{value.label}</td>
                      <td className="px-2.5 py-1.5 font-bold text-slate-900">{value.value}</td>
                      <td className="px-2.5 py-1.5 text-slate-500">
                        {value.printedRange ?? '—'}
                        {value.outsidePrintedRange ? (
                          <span className="ml-1 font-semibold text-caution-700">outside</span>
                        ) : null}
                      </td>
                      <td
                        className={`px-2.5 py-1.5 text-right ${
                          value.confidence !== null && value.confidence < 0.7 ? 'font-bold text-caution-700' : 'text-slate-500'
                        }`}
                      >
                        {value.confidence !== null ? `${Math.round(value.confidence * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-600">{report.statusNote}</p>
          )}
          <p className="text-[10.5px] text-slate-500">
            A misread value is corrected on the Reports page before it is verified; it cannot be edited
            once it is in her record.
          </p>
        </div>

        <div>
          <p className="font-heading mb-2 text-[11px] font-bold tracking-wide text-slate-700 uppercase">
            Original document
          </p>
          <OriginalPreview uploadId={report.uploadId} contentType={report.contentType} />
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                     */
/* -------------------------------------------------------------------------- */

function UploadModal({
  open,
  onClose,
  target,
}: {
  open: boolean
  onClose: () => void
  target: { patientId: string; pregnancyId: string; visitId: string | null }
}) {
  const router = useRouter()
  const files = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<File[]>([])
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const add = (list: FileList | null) => {
    if (list) setChosen((current) => [...current, ...Array.from(list)])
  }

  const submit = () =>
    startTransition(async () => {
      setMessage(null)
      const form = new FormData()
      form.append('patientId', target.patientId)
      form.append('pregnancyId', target.pregnancyId)
      if (target.visitId) form.append('visitId', target.visitId)
      for (const file of chosen) form.append('files', file)

      const result = await uploadReportsAction(form)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message })
        return
      }
      setChosen([])
      setMessage({
        tone: result.failed.length > 0 ? 'error' : 'ok',
        text:
          `${result.stored} stored and being read now — they appear in this panel within a few seconds.` +
          (result.failed.length > 0 ? ` Not stored: ${result.failed.join('; ')}` : ''),
      })
      // The reading finishes after the response; look again as it lands.
      for (const delay of [4000, 10000, 20000]) setTimeout(() => router.refresh(), delay)
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload reports and scans"
      subtitle="Lab slips, USG reports, discharge cards — photographs or PDFs. Each is kept as uploaded and read; none enters her record until you review it."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || chosen.length === 0}
            className="flex items-center gap-1.5 rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Upload aria-hidden className="h-3.5 w-3.5" />}
            {pending ? 'Uploading…' : `Upload ${chosen.length || ''}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50/50 px-3 py-5 text-xs font-bold text-brand-800 hover:bg-brand-50"
          >
            <Camera aria-hidden className="h-6 w-6" />
            Take a photo
            <span className="font-normal text-slate-500">Opens the camera on a phone or tablet</span>
          </button>
          <button
            type="button"
            onClick={() => files.current?.click()}
            className="flex flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 px-3 py-5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Upload aria-hidden className="h-6 w-6" />
            Choose files
            <span className="font-normal text-slate-500">JPG, PNG, WebP or PDF · up to 12 MB each</span>
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={files}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="hidden"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />

        {chosen.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {chosen.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="numeric flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-slate-800">{file.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-slate-500">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                  <button
                    type="button"
                    onClick={() => setChosen((list) => list.filter((_, i) => i !== index))}
                    className="text-slate-400 hover:text-alert-700"
                    aria-label={`Remove ${file.name}`}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {message ? (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={`rounded-lg border px-3 py-2 text-xs ${
              message.tone === 'error'
                ? 'border-alert-200 bg-alert-50 text-alert-700'
                : 'border-verified-200 bg-verified-50 text-verified-700'
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Staged significant results                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the doctor has flagged at this visit, shown straight away in the
 * significant-results accordion it is headed for.
 *
 * It is not in her record yet — it commits with Save & Next — and the block
 * says so, so an unsaved flag never reads as a saved one.
 */
export function StagedSignificant({
  reports,
  kind,
}: {
  reports: readonly PendingReport[]
  kind: 'LAB' | 'SCAN'
}) {
  const { decisions, decide } = useConsultationDraft()
  const flagged = reports.filter((r) => r.kind === kind && decisions[r.uploadId] === 'FLAG')
  if (flagged.length === 0) return null

  return (
    <div className="rounded-lg border border-dashed border-alert-200 bg-alert-50/40 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-alert-700">
        <Flag aria-hidden className="h-3.5 w-3.5" />
        Flagged at this visit · saves with Save &amp; Next
      </p>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {flagged.flatMap((report) =>
          report.values.map((value) => (
            <li
              key={value.candidateId}
              className="numeric flex items-center justify-between gap-3 rounded border border-alert-200 bg-white p-2.5 text-xs"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{value.label}</span>
                <span className="block text-[11px] text-slate-500">
                  {report.shortTitle} · {report.date}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-bold text-alert-700">{value.value}</span>
                {value.printedRange ? (
                  <span className="text-[10px] text-slate-500">lab range {value.printedRange}</span>
                ) : null}
              </span>
            </li>
          )),
        )}
      </ul>
      <button
        type="button"
        onClick={() => flagged.forEach((r) => decide(r.uploadId, null))}
        className="mt-1.5 text-[10.5px] text-slate-500 hover:text-slate-800 hover:underline"
      >
        Undo these flags
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Patient queries                                                            */
/* -------------------------------------------------------------------------- */

function QueriesWidget({ queries, onOpen }: { queries: readonly QueryView[]; onOpen: () => void }) {
  const { addressedQueryIds } = useConsultationDraft()

  const addressed = queries.filter((q) => q.resolvedAt !== null || addressedQueryIds.has(q.id)).length
  const toAddress = queries.length - addressed

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 py-1 pr-1 pl-2.5 text-[11px] font-semibold text-slate-700 shadow-2xs transition-colors hover:border-violet-300 hover:bg-violet-50"
    >
      <MessagesSquare aria-hidden className="h-4 w-4 text-violet-600" />
      <span className="hidden sm:inline">Patient queries</span>
      <span className="numeric flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
        {toAddress} to address
      </span>
      <span className="numeric flex items-center gap-1 rounded-full bg-verified-600 px-2 py-0.5 text-[10px] font-bold text-white">
        {addressed} addressed
      </span>
    </button>
  )
}

function QueriesModal({
  open,
  onClose,
  queries,
  canAddress,
}: {
  open: boolean
  onClose: () => void
  queries: readonly QueryView[]
  canAddress: boolean
}) {
  const { addressedQueryIds, setAddressed } = useConsultationDraft()

  // Still to address first, read-first ones at the top; then the addressed.
  const ordered = [...queries].sort((a, b) => {
    const rank = (q: QueryView) =>
      q.resolvedAt !== null ? 3 : addressedQueryIds.has(q.id) ? 2 : q.isPriority ? 0 : 1
    return rank(a) - rank(b) || b.receivedAt.localeCompare(a.receivedAt)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Patient queries & voice triage"
      subtitle="Purple: still to be addressed. Green: addressed. Marking one addressed saves with this consultation."
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
        >
          Done
        </button>
      }
    >
      {ordered.length === 0 ? (
        <p className="text-xs text-slate-500">She has not sent any voice queries.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {ordered.map((query) => {
            const resolved = query.resolvedAt !== null
            const staged = addressedQueryIds.has(query.id)
            const green = resolved || staged

            return (
              <li
                key={query.id}
                className={`rounded-xl border p-3 ${
                  green ? 'border-verified-200 bg-verified-50/60' : 'border-violet-200 bg-violet-50/60'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <AudioLines aria-hidden className="h-4 w-4 text-violet-600" />
                    <span className="numeric">{query.receivedAt.slice(0, 16).replace('T', ' ')}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        query.isPriority ? 'bg-alert-100 text-alert-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {query.routingLabel}
                    </span>
                  </span>

                  {resolved ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-verified-700">
                      <Check aria-hidden className="h-3.5 w-3.5" />
                      Addressed {query.resolvedAt?.slice(0, 10)}
                    </span>
                  ) : staged ? (
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className="flex items-center gap-1 font-bold text-verified-700">
                        <Check aria-hidden className="h-3.5 w-3.5" />
                        Addressed · saves with consultation
                      </span>
                      <button
                        type="button"
                        onClick={() => setAddressed(query.id, false)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-500 hover:bg-white hover:text-slate-800"
                      >
                        <Undo2 aria-hidden className="h-3.5 w-3.5" />
                        Undo
                      </button>
                    </span>
                  ) : canAddress ? (
                    <button
                      type="button"
                      onClick={() => setAddressed(query.id, true)}
                      className="rounded-md border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700 transition-colors hover:bg-violet-100"
                    >
                      Mark as addressed
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-violet-700">To be addressed</span>
                  )}
                </div>

                <div className="mt-2 rounded-lg border border-white/80 bg-white/90 p-2.5">
                  {query.state === 'READY' ? (
                    <>
                      {/* Her own words first, and larger — a translation has
                          already misread a danger sign once: Sarvam rendered
                          "vision darkening" as "I feel sleepy". */}
                      <p className="text-[13px] leading-relaxed font-bold text-slate-900">{query.original}</p>
                      {query.english ? (
                        <p className="mt-0.5 text-[11px] text-slate-500 italic">{query.english}</p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-caution-700">Not translated. Read her own words above.</p>
                      )}
                      {query.isFixture ? (
                        <p className="mt-1 text-[10.5px] font-medium text-caution-700">
                          sample text — not a real transcription
                        </p>
                      ) : null}
                    </>
                  ) : query.state === 'PENDING' ? (
                    <p className="text-xs text-slate-500">Still transcribing. This is not an empty message.</p>
                  ) : (
                    <p className="text-xs text-caution-900">
                      Could not be transcribed — {query.error} Listen to the recording before assuming it
                      was routine.
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

export type { ReportDecision }
