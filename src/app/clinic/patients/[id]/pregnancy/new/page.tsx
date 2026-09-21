import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'

import { PregnancyForm } from './pregnancy-form'

export const metadata = { title: 'Open a pregnancy' }
export const dynamic = 'force-dynamic'

export default async function NewPregnancyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    redirect(`/sign-in?next=/clinic/patients/${id}/pregnancy/new`)
  }

  const { actor } = session

  if (!roleHasPermission(actor.role, 'pregnancy.create')) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) cannot open a pregnancy
            episode.
          </p>
        </Panel>
      </Shell>
    )
  }

  let patientName: string
  try {
    const patient = await getPatient(actor, id)
    patientName = patient.fullName
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  // A patient may hold only one active episode. Offering the form anyway would
  // send the nurse through it only to be refused on submit, so the existing
  // episode is surfaced here instead.
  const existing = await getActivePregnancyWithHistory(actor, id)
  if (existing) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">
            She already has an open pregnancy
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {patientName} has an active episode. Everything clinical belongs to
            it, so a second one would split her record in two. If this episode is
            wrong it has to be closed deliberately rather than replaced.
          </p>
          <Link
            href={`/clinic/patients/${id}`}
            className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Open her record
          </Link>
        </Panel>
      </Shell>
    )
  }

  return (
    <Shell>
      <header className="mb-6">
        <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {patientName}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Open a pregnancy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Labs, scans, visits and referrals all belong to an episode, so this has
          to exist before anything clinical can be recorded.
        </p>
      </header>

      <Panel>
        <PregnancyForm patientId={id} />
      </Panel>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
  )
}
