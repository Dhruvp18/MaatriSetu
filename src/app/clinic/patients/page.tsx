import Link from 'next/link'
import { redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { searchPatients } from '@modules/patients/patient.service'
import { ageInYears, type PatientSearchResult } from '@modules/patients/patient.types'

/**
 * Patient search.
 *
 * Two jobs. It is the ordinary way to reach a record at the counter, and it is
 * the documented fallback when a file sticker is damaged, lost or photocopied
 * (PRD §11 risk table) — so it has to work on the fragments a mother can
 * actually recite: part of a name, a file number, or a phone number in
 * whatever format she says it.
 *
 * A GET form, deliberately. The query lives in the URL, so a result list can be
 * re-opened with the browser's back button after a mis-click without retyping —
 * which at eighty patients a shift matters more than it sounds.
 */

export const metadata = { title: 'Find a patient' }
export const dynamic = 'force-dynamic'

export default async function PatientSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect('/sign-in?next=/clinic/patients')

  const { actor } = session
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  if (!roleHasPermission(actor.role, 'patient.search')) {
    return (
      <Shell>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) does not include patient lookup.
          </p>
        </div>
      </Shell>
    )
  }

  let results: PatientSearchResult[] = []
  let error: string | null = null

  if (query.length > 0) {
    try {
      results = await searchPatients(actor, { query })
    } catch (caught) {
      // A too-short query is a validation error, not a crash. Report it beside
      // the box rather than replacing the page with an error screen.
      if (caught instanceof AppError) error = caught.message
      else throw caught
    }
  }

  const today = todayIn(actor.clinicTimezone)

  return (
    <Shell>
      <header className="mb-6">
        <Link href="/clinic" className="text-sm text-brand-600 hover:underline">
          ← Clinic
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Find a patient</h1>
        <p className="mt-1 text-sm text-slate-500">
          File number, name, or mobile number. Use this when a sticker is missing
          or will not scan.
        </p>
      </header>

      <form method="GET" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          autoComplete="off"
          placeholder="MH-2026-89412, Sunita, or 98331 00001"
          aria-label="Search patients"
          className="numeric w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {error}
        </p>
      ) : null}

      {query.length > 0 && !error ? (
        results.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-600">
              No patient here matches “{query}”.
            </p>
            {/*
              The useful next step, not a dead end. A mother whose file cannot be
              found is usually new to this clinic.
            */}
            {roleHasPermission(actor.role, 'patient.register') ? (
              <Link
                href="/clinic/patients/new"
                className="mt-3 inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                Register her instead
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {results.map((result) => (
              <li key={result.id}>
                <Link
                  href={`/clinic/patients/${result.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{result.fullName}</p>
                    <p className="numeric text-sm text-slate-500">{result.uhid}</p>
                  </div>

                  {/*
                    The result union carries demographics only for roles that
                    hold `patient.read`. An assistant's row simply has no age to
                    render — there is no nullable field here to mistake for
                    "not recorded" (ARCH-10).
                  */}
                  {result.visibility === 'FULL' ? (
                    <div className="shrink-0 text-right">
                      <p className="numeric text-sm text-slate-700">
                        {ageInYears(result.age, today) ?? '—'} y
                      </p>
                      <p className="text-xs text-slate-500">
                        {result.hasActiveQrToken ? 'Sticker issued' : 'No sticker'}
                      </p>
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
}
