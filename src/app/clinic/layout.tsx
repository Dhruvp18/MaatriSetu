import { Activity, Home, QrCode, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'

import { resolveSession } from '@core/auth/session'

import { chooseClinic, signOut } from '../sign-in/actions'

import { ProfileMenu } from './master-packs/profile-menu'

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
      {/*
        The clinical header bar. Sticky and only 56px tall: it is chrome, and
        every pixel it takes is a pixel of the record the doctor came to read.
      */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 shadow-[0_1px_3px_rgb(15_23_42/0.02)] backdrop-blur-md lg:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/clinic"
            aria-label="Today’s patients"
            className="flex items-center gap-2 rounded-md bg-brand-800 px-2.5 py-1 text-white shadow-sm hover:bg-brand-700"
          >
            <Activity aria-hidden className="h-4.75 w-4.75" strokeWidth={2.25} />
            <span className="font-heading text-[13px] font-extrabold tracking-wide">
              MAATRISETU
            </span>
          </Link>

          <span aria-hidden className="hidden h-4 w-px bg-slate-300 sm:block" />

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="hidden font-medium whitespace-nowrap text-slate-900 sm:inline">
              OPD Antenatal Cockpit
            </span>
            <span className="hidden text-slate-400 sm:inline">•</span>
            <span className="numeric hidden text-slate-500 sm:inline">
              {actor.displayName}
              {/*
                The acting role is shown at all times. A nurse and a doctor see
                different screens, and someone who cannot work out which role
                they are in will read a missing section as missing data.
              */}{' '}
              ({actor.role.toLowerCase()})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1">
            <HeaderLink href="/clinic" icon={<Home className="h-4 w-4" />}>
              Today
            </HeaderLink>
            {roleHasPermission(actor.role, 'patient.read') ? (
              <HeaderLink href="/clinic/scan" icon={<QrCode className="h-4 w-4" />}>
                Scan
              </HeaderLink>
            ) : null}
            {roleHasPermission(actor.role, 'patient.register') ? (
              <HeaderLink href="/clinic/patients/new" icon={<UserPlus className="h-4 w-4" />}>
                New patient
              </HeaderLink>
            ) : null}
          </nav>

          <form action={signOut}>
            <button
              type="submit"
              suppressHydrationWarning
              className="rounded border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs whitespace-nowrap text-slate-600 transition-colors hover:bg-slate-200 hover:text-brand-800"
            >
              Sign out
            </button>
          </form>

          <span aria-hidden className="hidden h-4 w-px bg-slate-200 sm:block" />

          <ProfileMenu
            displayName={actor.displayName}
            initials={initials(actor.displayName)}
            role={actor.role}
            // Packs are prescription shorthand, so they are for whoever may prescribe.
            canManagePacks={roleHasPermission(actor.role, 'prescription.write')}
          />

        </div>
      </header>

      {children}
    </div>
  )
}

/** `Ananya Rao` → `AR`. Falls back to the first character for a single name. */
function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="glass w-full max-w-md space-y-4 rounded-xl border border-slate-200/90 p-6 shadow-xs">
        <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">{title}</h1>
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

function HeaderLink({
  href,
  icon,
  children,
}: {
  href: '/clinic' | '/clinic/scan' | '/clinic/patients/new'
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-800"
    >
      <span aria-hidden className="text-slate-500">
        {icon}
      </span>
      <span className="hidden md:inline">{children}</span>
    </Link>
  )
}
