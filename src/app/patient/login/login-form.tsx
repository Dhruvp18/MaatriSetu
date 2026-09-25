'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { login, type LoginState } from './actions'

const initial: LoginState = { error: null }

const FIELD =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#8a3c4a] focus:ring-1 focus:ring-[#8a3c4a]'

function SignInButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#8a3c4a] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#743140] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  )
}

export function LoginForm({
  labels,
}: {
  labels: {
    uhid: string
    uhidPlaceholder: string
    password: string
    signIn: string
    signingIn: string
  }
}) {
  const [state, action] = useActionState(login, initial)

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4 text-left">
      <div>
        <label htmlFor="uhid" className="mb-1.5 block text-xs font-semibold text-slate-600">
          {labels.uhid}
        </label>
        <input
          id="uhid"
          name="uhid"
          type="text"
          autoComplete="username"
          required
          placeholder={labels.uhidPlaceholder}
          className={`${FIELD} numeric`}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-600">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={FIELD}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-alert-700">
          {state.error}
        </p>
      ) : null}

      <SignInButton label={labels.signIn} busy={labels.signingIn} />
    </form>
  )
}
