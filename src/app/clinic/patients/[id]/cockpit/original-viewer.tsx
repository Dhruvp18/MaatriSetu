'use client'

import { ExternalLink, FileImage, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'

import { openOriginalAction } from './report-actions'

/**
 * The original photograph or PDF a value was read from.
 *
 * The link is minted on demand and lives for a few minutes (core/storage):
 * nothing on the page carries a lasting URL to a patient's report. Checking an
 * extracted number against the paper it came from is the whole point of
 * keeping the original, so this is one click from every report.
 */

export function OriginalPreview({
  uploadId,
  contentType,
}: {
  uploadId: string
  contentType: string | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // When the type is not known up front, an image that fails to decode is
  // retried as a document, which is what a PDF is.
  const [asDocument, setAsDocument] = useState(false)

  const load = () =>
    startTransition(async () => {
      setError(null)
      const result = await openOriginalAction(uploadId)
      if (result.ok) setUrl(result.url)
      else setError(result.message)
    })

  if (!url) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-md border border-diagnostic-600/30 bg-sky-50 px-3 py-1.5 text-xs font-bold text-diagnostic-600 transition-colors hover:bg-sky-100 disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <FileImage aria-hidden className="h-4 w-4" />}
          View original report
        </button>
        {error ? <p className="text-[11px] text-alert-700">{error}</p> : null}
      </div>
    )
  }

  const isPdf = contentType === 'application/pdf' || asDocument

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">
          Original {isPdf ? 'PDF' : 'photograph'} · link valid for 5 minutes
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
        >
          Open full size <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </div>
      {isPdf ? (
        <iframe title="Original report" src={url} className="h-[60vh] w-full rounded-lg border border-slate-200 bg-white" />
      ) : (
        // A signed, short-lived storage URL; next/image would try to cache it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Original report as uploaded"
          onError={() => setAsDocument(true)}
          className="max-h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50 object-contain"
        />
      )}
    </div>
  )
}

/** A compact "original" link for a verified result, opening the file in a modal. */
export function ViewOriginalButton({ uploadId, title }: { uploadId: string; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print text-[10px] font-semibold text-diagnostic-600 hover:underline"
      >
        original
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} subtitle="The document this value was read from.">
        <OriginalPreview uploadId={uploadId} contentType={null} />
      </Modal>
    </>
  )
}
