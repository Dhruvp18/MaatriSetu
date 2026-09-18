import Link from 'next/link'
import { redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'

import { RegistrationForm } from './registration-form'

export const metadata = { title: 'Register a patient' }
export const dynamic = 'force-dynamic'

export default async function NewPatientPage() {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect('/sign-in?next=/clinic/patients/new')

  // Checked again in the service, which is what actually enforces it. This is
  // here so an assistant sees an explanation instead of a form that fails on
  // submit (ARCH-5: hiding a control is not authorization).
  if (!roleHasPermission(session.actor.role, 'patient.register')) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Registering patients is done by nursing and medical staff. Your role
            is {session.actor.role.toLowerCase()}.
          </p>
          <Link
            href="/clinic"
            className="mt-4 inline-block text-sm text-brand-600 hover:underline"
          >
            Back to clinic
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link href="/clinic" className="text-sm text-brand-600 hover:underline">
          ← Clinic
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Register a patient</h1>
        <p className="mt-1 text-sm text-slate-500">
          Identity only. Her pregnancy, dating and visit are recorded separately,
          so nothing here needs to wait on information she does not have with
          her.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <RegistrationForm />
      </div>
    </main>
  )
}
