import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { estimatedDueDate, todayIn } from '@core/obstetrics/dating'
import { ageInYears, formatBloodGroup } from '@modules/patients/patient.types'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancy } from '@modules/pregnancies/pregnancy.service'
import { listUpcomingAppointments } from '@modules/schedule/schedule.service'

import { PatientCardPanel } from './patient-card'

/**
 * The patient's own card: a hard copy she keeps, with a QR that opens her file.
 *
 * The QR is the same opaque sticker token the file carries (PRD F1) — it holds
 * no name, number or clinical fact, and it resolves only for signed-in staff of
 * this clinic. Everything readable on the card is printed beside it, so the
 * card is useful to her even where there is no scanner.
 */

export const metadata = { title: 'Patient card' }
export const dynamic = 'force-dynamic'

export default async function PatientCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/card`)
  const { actor } = session

  let patient
  try {
    patient = await getPatient(actor, id)
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) notFound()
    throw error
  }

  const today = todayIn(actor.clinicTimezone)
  const [pregnancy, upcoming] = await Promise.all([
    getActivePregnancy(actor, id),
    roleHasPermission(actor.role, 'visit.read') ? listUpcomingAppointments(actor, id) : Promise.resolve([]),
  ])

  const age = ageInYears(patient.age, today)
  const phone = patient.contacts.find((c) => c.isPrimary)?.phoneE164 ?? patient.contacts[0]?.phoneE164 ?? null

  const gpla = pregnancy
    ? (['gravida', 'parity', 'living', 'abortions'] as const)
        .map((k, i) => `${'GPLA'[i]}${pregnancy.gravidaParity[k] ?? '–'}`)
        .join(' ')
    : null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="no-print flex items-center justify-between">
        <Link href={`/clinic/patients/${id}/cockpit`} className="text-sm text-brand-600 hover:underline">
          ← Back to the cockpit
        </Link>
      </div>

      <PatientCardPanel
        patientId={patient.id}
        canIssue={roleHasPermission(actor.role, 'patient.issue_qr')}
        hasActiveQrToken={patient.hasActiveQrToken}
        details={{
          fullName: patient.fullName,
          uhid: patient.uhid,
          age: age !== null ? `${age} years` : null,
          phone,
          bloodGroup: patient.bloodGroup ? formatBloodGroup(patient.bloodGroup.value) : null,
          lmp: pregnancy?.reportedLmp.date ?? null,
          edd: pregnancy?.dating.status === 'ESTABLISHED' ? estimatedDueDate(pregnancy.dating.reference) : null,
          gpla,
          nextVisit: upcoming[0]?.scheduledOn ?? null,
          issuedOn: today,
        }}
      />
    </main>
  )
}
