'use client'

import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { submitUpload, type UploadState } from './actions'

/**
 * Photographing a lab slip at the counter (PRD F2).
 *
 * `capture="environment"` opens the rear camera straight away on a phone, which
 * is how this is actually used: the assistant is holding the paper, not
 * browsing a file system.
 *
 * The form does not claim anything about what the photograph says. Everything
 * it tells the user is about the document — stored, queued, awaiting a doctor —
 * because at this point nobody has read it.
 */

const initialState: UploadState = { status: 'idle' }

function UploadButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Uploading…' : 'Upload report'}
    </button>
  )
}

export function UploadForm({
  patientId,
  pregnancyId,
  visitId,
}: {
  patientId: string
  pregnancyId: string | null
  visitId: string | null
}) {
  const [state, formAction] = useActionState(submitUpload, initialState)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <form
      action={(formData) => {
        formAction(formData)
        // Cleared so the same photograph cannot be sent twice by a second
        // click. A duplicate would be stored, queued and read again — the
        // content hash makes it detectable afterwards, but not preventable.
        if (fileInput.current) fileInput.current.value = ''
      }}
      className="space-y-3"
    >
      <input type="hidden" name="patientId" value={patientId} />
      {pregnancyId ? <input type="hidden" name="pregnancyId" value={pregnancyId} /> : null}
      {visitId ? <input type="hidden" name="visitId" value={visitId} /> : null}

      <div>
        <label htmlFor="image" className="mb-1.5 block text-sm font-medium text-slate-700">
          Photograph of the report
        </label>
        <input
          ref={fileInput}
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          capture="environment"
          required
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          Fill the frame with the printed area. Up to 12 MB.
        </p>
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === 'done' ? (
        <p
          role="status"
          className="rounded-lg border border-brand-600/30 bg-brand-50 px-3 py-2.5 text-sm text-slate-700"
        >
          {state.message}
        </p>
      ) : null}

      <UploadButton />
    </form>
  )
}
