import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'

import { chooseClinic, signOut } from '../sign-in/actions'

/**
 * The authenticated clinic area.
 *
 * Each of the four session outcomes gets its own treatment. The one that
 * matters most is NO_MEMBERSHIP: bouncing that user back to sign-in would loop
 * forever, because they *can* authenticate — they simply have no authority
 * here. They get told so, in as many words.
 *
 * This layout is not a security boundary. It decides what to render; every
 * permission check happens inside a domain service (ARCH-5).
 */

export const dynamic = 'force-dynamic'

export default async function ClinicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await resolveSession()

  if (session.status === 'ANONYMOUS') redirect('/sign-in?next=/clinic')

  if (session.status === 'NO_MEMBERSHIP') {
    return (
      <Centered title="No clinic access">
        <p className="text-sm leading-relaxed text-slate-600">
          You are signed in
          {session.displayName ? ` as ${session.displayName}` : ''}, but your
          account is not an active member of any clinic. An administrator needs
          to grant you access before you can continue.
        </p>
        <SignOutButton label="Sign out" />
      </Centered>
    )
  }

  if (session.status === 'CLINIC_CHOICE_REQUIRED') {
    return (
      <Centered title="Choose a clinic">
        <p className="text-sm leading-relaxed text-slate-600">
          You work at more than one facility. Everything you do next is recorded
          against the one you pick.
        </p>
        <ul className="space-y-2">
          {session.options.map((option) => (
            <li key={option.clinicId}>
              <form action={chooseClinic}>
                <input type="hidden" name="clinicId" value={option.clinicId} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm transition hover:border-brand-600"
                >
                  <span className="font-medium text-slate-900">{option.clinicName}</span>
                  <span className="text-xs tracking-wide text-slate-500 uppercase">
                    {option.role.toLowerCase()}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        <SignOutButton label="Sign out" />
      </Centered>
    )
  }

  const { actor } = session

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white"
            >
              M
            </span>
            <span className="text-sm font-semibold text-slate-900">MaatriSetu</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{actor.displayName}</p>
              {/*
                The acting role is shown at all times. A nurse and a doctor see
                different screens, and someone who cannot work out which role
                they are in will read a missing section as missing data.
              */}
              <p className="text-xs tracking-wide text-slate-500 uppercase">
                {actor.role.toLowerCase()}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        {label}
      </button>
    </form>
  )
}
