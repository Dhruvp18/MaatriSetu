import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { clinicLocalFromInstant, formatClinicDateTime } from '@core/time/clinic-time'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'
import { listForPregnancy } from '@modules/referrals/referral.service'
import type { Referral } from '@modules/referrals/referral.types'
import { getOpenVisit } from '@modules/visits/visit.service'

import { ReferralDraftForm, StartReferralForm } from './referral-form'

/**
 * Emergency referral: the preparation screen.
 *
 * Deliberately reachable without an open visit. A woman fitting in the corridor
 * is not inside an OPD consultation, and a transfer that had to wait for
 * someone to open one would be a transfer delayed by software.
 *
 * At most one draft is worked on at a time. Issued referrals are listed below
 * it and are never editable from here — the only thing that can be done to an
 * issued referral is to replace it.
 */

export const metadata = { title: 'Referral' }
export const dynamic = 'force-dynamic'

export default async function ReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ supersedes?: string }>
}) {
  const { id } = await params
  const { supersedes } = await searchParams

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/referral`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'referral.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) cannot open a referral.
          </p>
        </Panel>
      </Shell>
    )
  }

  let patientName: string
  try {
    patientName = (await getPatient(actor, id)).fullName
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  const episode = await getActivePregnancyWithHistory(actor, id)

  if (!episode) {
    return (
      <Shell>
        <Back id={id} name={patientName} />
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">No open pregnancy</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            A referral belongs to a pregnancy episode, so one has to be opened
            first. The slip is built from that episode&rsquo;s record.
          </p>
          {roleHasPermission(actor.role, 'pregnancy.create') ? (
            <Link
              href={`/clinic/patients/${id}/pregnancy/new`}
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Open a pregnancy
            </Link>
          ) : null}
        </Panel>
      </Shell>
    )
  }

  const { pregnancy } = episode
  const referrals = await listForPregnancy(actor, pregnancy.id)

  // At most one at a time. Two open drafts for the same transfer is two
  // half-documents and no way to tell which one is about to be issued.
  const draft = referrals.find((r) => r.document.state === 'DRAFT') ?? null
  const issued = referrals.filter((r) => r.document.state !== 'DRAFT')

  const openVisit = roleHasPermission(actor.role, 'visit.read')
    ? await getOpenVisit(actor, pregnancy.id)
    : null

  const nowLocal = clinicLocalFromInstant(new Date().toISOString(), actor.clinicTimezone)

  return (
    <Shell>
      <Back id={id} name={patientName} />

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Emergency referral</h1>
        <p className="mt-1 text-sm text-slate-500">{patientName}</p>
      </header>

      {supersedes ? (
        <p className="mb-4 rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
          This will be a replacement for an issued referral. The original stays
          on the record exactly as it was handed over, and stops being the live
          document only when this one is issued.
        </p>
      ) : null}

      <div className="space-y-4">
        {draft && draft.document.state === 'DRAFT' ? (
          <Panel>
            <SectionTitle>Draft</SectionTitle>
            {roleHasPermission(actor.role, 'referral.draft') ? (
              <ReferralDraftForm
                patientId={id}
                referralId={draft.id}
                version={draft.version}
                draft={draft.document.draft}
                times={{
                  departureAt: draft.document.draft.departureAt
                    ? clinicLocalFromInstant(draft.document.draft.departureAt, actor.clinicTimezone)
                    : '',
                  vitalsRecordedAt:
                    draft.document.draft.transferVitals.status === 'RECORDED'
                      ? clinicLocalFromInstant(
                          draft.document.draft.transferVitals.recordedAt,
                          actor.clinicTimezone,
                        )
                      : nowLocal,
                  pvExaminedAt:
                    draft.document.draft.examination.status === 'PERFORMED'
                      ? clinicLocalFromInstant(
                          draft.document.draft.examination.examinedAt,
                          actor.clinicTimezone,
                        )
                      : nowLocal,
                }}
                canIssue={roleHasPermission(actor.role, 'referral.issue')}
              />
            ) : (
              <p className="text-sm text-slate-600">
                A draft is in progress. Your role cannot edit it.
              </p>
            )}
          </Panel>
        ) : (
          <Panel>
            <SectionTitle>Start a referral</SectionTitle>
            {roleHasPermission(actor.role, 'referral.draft') ? (
              <StartReferralForm
                patientId={id}
                pregnancyId={pregnancy.id}
                openVisitId={openVisit?.id ?? null}
                supersedesId={supersedes}
              />
            ) : (
              <p className="text-sm text-slate-600">
                Your role cannot start a referral.
              </p>
            )}
          </Panel>
        )}

        {issued.length > 0 ? (
          <Panel>
            <SectionTitle>Issued for this pregnancy</SectionTitle>
            <ul className="space-y-2">
              {issued.map((referral) => (
                <li key={referral.id}>
                  <IssuedRow
                    referral={referral}
                    patientId={id}
                    timeZone={actor.clinicTimezone}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </Shell>
  )
}

/**
 * One issued referral.
 *
 * Superseded slips stay listed. A receiving unit ringing back about "the one
 * from last night" may well be holding the document that was replaced, and the
 * record has to be able to show exactly what that said.
 */
function IssuedRow({
  referral,
  patientId,
  timeZone,
}: {
  referral: Referral
  patientId: string
  timeZone: string
}) {
  const doc = referral.document
  if (doc.state === 'DRAFT') return null

  if (doc.state === 'CANCELLED') {
    return (
      <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <span className="text-slate-500">Cancelled</span>
        <span className="text-slate-700"> — {doc.reason}</span>
      </div>
    )
  }

  return (
    <Link
      href={`/clinic/patients/${patientId}/referral/${referral.id}`}
      className="block rounded-lg border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">
          {doc.snapshot.receivingFacility.name}
        </span>
        <span className="numeric text-xs text-slate-500">
          {formatClinicDateTime(doc.issuedAt, timeZone)}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-slate-600">{doc.snapshot.indication}</p>
      {doc.state === 'SUPERSEDED' ? (
        <p className="mt-1 text-xs text-caution-700">
          Replaced by a later referral on {formatClinicDateTime(doc.supersededAt, timeZone)}. Its
          links no longer open.
        </p>
      ) : null}
    </Link>
  )
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5">{children}</section>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </h2>
  )
}

function Back({ id, name }: { id: string; name: string }) {
  return (
    <div className="mb-2">
      <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
        ← {name}
      </Link>
    </div>
  )
}
