'use client'

import { useActionState, useRef } from 'react'
import { associateVoiceNoteAction, AssociateState } from './actions'

const initialState: AssociateState = { status: 'idle' }

export function AssociateNoteForm({ queryId }: { queryId: string }) {
  const [state, action, pending] = useActionState(associateVoiceNoteAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={action} className="flex items-center gap-4">
      <input type="hidden" name="queryId" value={queryId} />
      
      <div className="flex-1 max-w-sm">
        <label htmlFor={`patientId-${queryId}`} className="sr-only">
          Patient UUID
        </label>
        <input
          type="text"
          id={`patientId-${queryId}`}
          name="patientId"
          required
          placeholder="Enter Patient UUID..."
          className="block w-full rounded-md border-slate-300 py-1.5 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? 'Assigning...' : 'Assign to Patient'}
      </button>

      {state.status === 'error' && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  )
}
