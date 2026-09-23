'use client'

import { useActionState, useRef } from 'react'
import { uploadVoiceNoteAction, UploadState } from './actions'

const initialState: UploadState = { status: 'idle' }

export function VoiceUploadForm() {
  const [state, action, pending] = useActionState(uploadVoiceNoteAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={(formData) => {
        action(formData)
        formRef.current?.reset()
      }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1 space-y-2">
        <label htmlFor="audio" className="block text-sm font-medium text-slate-700">
          Audio File (.m4a, .ogg)
        </label>
        <input
          type="file"
          id="audio"
          name="audio"
          accept="audio/*"
          required
          className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
        />
      </div>

      <div className="flex-1 space-y-2">
        <label htmlFor="fromPhone" className="block text-sm font-medium text-slate-700">
          Phone Number (Optional)
        </label>
        <input
          type="text"
          id="fromPhone"
          name="fromPhone"
          placeholder="e.g. +91 9876543210"
          className="block w-full rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50"
      >
        {pending ? 'Uploading...' : 'Upload'}
      </button>

      {state.status === 'error' && (
        <p className="mt-2 text-sm text-red-600 sm:mt-0 sm:w-full">{state.message}</p>
      )}
      {state.status === 'success' && (
        <p className="mt-2 text-sm text-green-600 sm:mt-0 sm:w-full">Upload queued for transcription!</p>
      )}
    </form>
  )
}
