import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import {
  estimatedDueDate,
  formatGestationalAge,
  gestationalAge,
  todayIn,
} from '@core/obstetrics/dating'
import { getPatient } from '@modules/patients/patient.service'
import {
  ageInYears,
  describeAllergies,
  formatBloodGroup,
  isRhNegative,
  type Patient,
} from '@modules/patients/patient.types'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'
import type { PregnancyWithHistory } from '@modules/pregnancies/pregnancy.types'
import { listVisits } from '@modules/visits/visit.service'

import { StickerPanel } from './sticker-panel'

/**
 * One patient's record.
 *
 * Not the cockpit — that is the consultation screen and comes later. This is
 * the counter's view: confirm you have the right woman, see whether she has a
 * current pregnancy and a working sticker, and get her to the next step.
 *
 * Every unknown is rendered as an unknown. A blank where a blood group should
 * be, or an empty allergy line, is the failure this product exists to prevent.
 */

export const dynamic = 'force-dynamic'

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'patient.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) can look a patient up to attach
            a report, but cannot open her record.
          </p>
          <Link href="/clinic/patients" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
            Back to search
          </Link>
        </Panel>
      </Shell>
    )
  }

  let patient: Patient
  try {
    patient = await getPatient(actor, id)
  } catch (error) {
    // The service returns the same not-found for "does not exist" and "belongs
    // to another clinic", so this leaks nothing either way.
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  const episode: PregnancyWithHistory | null = roleHasPermission(actor.role, 'pregnancy.read')
    ? await getActivePregnancyWithHistory(actor, patient.id)
    : null

  const visits = episode && roleHasPermission(actor.role, 'visit.read')
    ? await listVisits(actor, episode.pregnancy.id)
    : []

  const today = todayIn(actor.clinicTimezone)
  const age = ageInYears(patient.age, today)

  return (
    <Shell>
      <div className="no-print">
        <Link href="/clinic/patients" className="text-sm text-brand-600 hover:underline">
          ← Find a patient
        </Link>
      </div>

      <header className="mt-2 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{patient.fullName}</h1>
        <p className="numeric mt-1 text-sm text-slate-500">
          {patient.uhid}
          {age !== null ? ` · ${age} y` : ''}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {/*
            Recorded facts only. Nothing here is computed from a clinical rule:
            Rh-negative is a transcribed blood group, and the allergy pill
            reflects what a clinician entered (PRD §3, non-goals).
          */}
          {patient.bloodGroup && isRhNegative(patient.bloodGroup.value) ? (
            <Pill tone="alert">Rh negative · {formatBloodGroup(patient.bloodGroup.value)}</Pill>
          ) : null}
          {patient.allergies.status === 'KNOWN' ? (
            <Pill tone="alert">Allergy · {describeAllergies(patient.allergies)}</Pill>
          ) : null}
          {patient.allergies.status === 'UNKNOWN' ? (
            <Pill tone="caution">Allergies not recorded</Pill>
          ) : null}
        </div>
      </header>

      <div className="space-y-4">
        <Panel>
          <SectionTitle>Identity</SectionTitle>
          <Facts
            rows={[
              ['File number', patient.uhid, true],
              [
                'Blood group',
                patient.bloodGroup
                  ? `${formatBloodGroup(patient.bloodGroup.value)} (${sourceLabel(patient.bloodGroup.source)})`
                  : 'Not recorded',
                Boolean(patient.bloodGroup),
              ],
              ['Allergies', describeAllergies(patient.allergies), false],
              [
                'ABHA',
                patient.abhaId
                  ? `${patient.abhaId} · ${patient.abhaVerification === 'VERIFIED' ? 'verified' : 'as stated, not verified'}`
                  : 'Not provided',
                Boolean(patient.abhaId),
              ],
            ]}
          />
        </Panel>

        <Panel>
          <SectionTitle>Contacts</SectionTitle>
          {patient.contacts.length === 0 ? (
            <p className="text-sm text-slate-600">No number recorded.</p>
          ) : (
            <ul className="space-y-2">
              {patient.contacts.map((contact) => (
                <li key={contact.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="numeric text-slate-800">{contact.phoneE164}</span>
                  <span className="text-slate-500">
                    {contact.relationship.toLowerCase().replace(/_/g, ' ')}
                    {/*
                      Verification is what gates inbound message matching. An
                      unverified number is shown as such rather than silently
                      treated as hers — handsets are shared.
                    */}
                    {contact.isVerified ? '' : ' · unverified'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <SectionTitle>Current pregnancy</SectionTitle>
          {episode === null ? (
            <div>
              <p className="text-sm text-slate-600">
                No active pregnancy episode. Labs, scans and visits all belong to
                an episode, so one has to be opened before anything clinical can
                be recorded.
              </p>
              {roleHasPermission(actor.role, 'pregnancy.create') ? (
                <Link
                  href={`/clinic/patients/${patient.id}/pregnancy/new`}
                  className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Open a pregnancy
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <PregnancySummary episode={episode} today={today} />
              <div className="flex flex-wrap gap-2">
                {roleHasPermission(actor.role, 'observation.read') ? (
                  <Link
                    href={`/clinic/patients/${patient.id}/cockpit`}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    Open cockpit
                  </Link>
                ) : null}
                {roleHasPermission(actor.role, 'visit.read') ? (
                  <Link
                    href={`/clinic/patients/${patient.id}/visit`}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    Today’s visit
                  </Link>
                ) : null}
                {roleHasPermission(actor.role, 'upload.read') ? (
                  <Link
                    href={`/clinic/patients/${patient.id}/reports`}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                  >
                    Reports
                  </Link>
                ) : null}
                {/*
                  Reachable without an open visit, deliberately. A woman
                  deteriorating in the corridor is not inside a consultation,
                  and a transfer must never wait on someone opening one.
                */}
                {roleHasPermission(actor.role, 'referral.read') ? (
                  <Link
                    href={`/clinic/patients/${patient.id}/referral`}
                    className="rounded-lg border border-alert-600/40 px-4 py-2 text-sm font-medium text-alert-700 transition hover:bg-alert-50"
                  >
                    Emergency referral
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle>File sticker</SectionTitle>
          {roleHasPermission(actor.role, 'patient.issue_qr') ? (
            <StickerPanel patientId={patient.id} hasActiveQrToken={patient.hasActiveQrToken} />
          ) : (
            <p className="text-sm text-slate-600">
              {patient.hasActiveQrToken
                ? 'This file has a working sticker.'
                : 'No sticker issued. Nursing staff can issue one.'}
            </p>
          )}
        </Panel>

        {episode && (
          <Panel>
            <SectionTitle>Visit History</SectionTitle>
            {visits.length === 0 ? (
              <p className="text-sm text-slate-600">No visits recorded for this pregnancy.</p>
            ) : (
              <ul className="space-y-3">
                {visits.map(visit => (
                  <li key={visit.id} className="flex flex-wrap items-center justify-between gap-4 border border-slate-100 bg-slate-50 rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Visit #{visit.id.split('-')[0]} 
                        <span className="text-slate-500 font-normal ml-2">
                          {new Date(visit.occurredAt).toLocaleDateString('en-IN')}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1 capitalize">{visit.visitType.replace(/_/g, ' ').toLowerCase()} · {visit.status}</p>
                    </div>
                    {visit.status === 'SAVED' && (
                      <Link
                        href={`/print/mcp/${visit.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-brand-300 text-brand-600 px-3 py-1.5 text-xs font-semibold bg-white transition hover:bg-brand-50"
                      >
                        Print MCP Slip
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </Shell>
  )
}

function PregnancySummary({
  episode,
  today,
}: {
  episode: PregnancyWithHistory
  today: string
}) {
  const { pregnancy, obstetricHistory } = episode
  const { dating } = pregnancy

  return (
    <div className="space-y-3">
      {/*
        "Dating not established" is a real and common state, and it is rendered
        as such. Inventing a gestational age from a guessed LMP would put a
        number on screen that a clinician could act on.
      */}
      {dating.status === 'NOT_ESTABLISHED' ? (
        <p className="rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
          Dating not established. No gestational age or due date can be shown
          until an LMP or a dating scan is recorded.
        </p>
      ) : (
        <Facts
          rows={[
            ['Gestation today', formatGestationalAge(gestationalAge(dating.reference, today)), true],
            ['Estimated due date', estimatedDueDate(dating.reference), true],
            [
              'Dated by',
              `${dating.method.toLowerCase().replace(/_/g, ' ')} · ${dating.certainty.toLowerCase()}`,
              false,
            ],
          ]}
        />
      )}

      <Facts
        rows={[
          [
            'G / P / L / A',
            formatGpla(pregnancy.gravidaParity),
            true,
          ],
          ['Previous pregnancies on record', String(obstetricHistory.length), true],
        ]}
      />

      {obstetricHistory.some((entry) => entry.hasUterineScar) ? (
        <p className="rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
          Previous uterine scar recorded.
        </p>
      ) : null}
    </div>
  )
}

/** `G2 P1 L1 A0`, with a dash wherever a count was never asked. */
function formatGpla(gp: {
  gravida: number | null
  parity: number | null
  living: number | null
  abortions: number | null
}): string {
  const part = (label: string, value: number | null) => `${label}${value ?? '–'}`
  return [
    part('G', gp.gravida),
    part('P', gp.parity),
    part('L', gp.living),
    part('A', gp.abortions),
  ].join(' ')
}

function sourceLabel(source: string): string {
  return source.toLowerCase().replace(/_/g, ' ')
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

/** `[label, value, isNumeric]` rows. Numeric values get tabular figures. */
function Facts({ rows }: { rows: ReadonlyArray<readonly [string, string, boolean]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value, numeric]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className={`text-slate-800 ${numeric ? 'numeric' : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Pill({ tone, children }: { tone: 'alert' | 'caution'; children: React.ReactNode }) {
  const styles =
    tone === 'alert'
      ? 'border-alert-600/30 bg-alert-50 text-alert-700'
      : 'border-caution-700/30 bg-caution-50 text-caution-700'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      {children}
    </span>
  )
}
