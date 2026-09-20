import Link from 'next/link'
import { redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'

import { ScanCapture } from './scan-capture'

/**
 * Scan a file sticker.
 *
 * The product's front door: this is the second that is supposed to replace
 * forty-five of flipping through a paper file. Kept to one thing on the screen
 * so the field cannot lose focus to anything competing for attention.
 *
 * Scanning requires `patient.read`, the same permission as opening a record by
 * id. A sticker is a faster way to reach a record, never a way to reach one you
 * could not otherwise open — so an assistant, who may look a patient up to
 * attach a slip but may not read her record, cannot scan her way past that.
 */

export const metadata = { title: 'Scan' }
export const dynamic = 'force-dynamic'

export default async function ScanPage() {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect('/sign-in?next=/clinic/scan')

  const { actor } = session

  if (!roleHasPermission(actor.role, 'patient.read')) {
    return (
      <main className="mx-auto max-w-lg px-6 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Scanning opens a patient&rsquo;s full record. Your role
            ({actor.role.toLowerCase()}) can look a patient up by name or file
            number to attach a report, but cannot open her record.
          </p>
          <Link
            href="/clinic/patients"
            className="mt-4 inline-block text-sm text-brand-600 hover:underline"
          >
            Find a patient instead
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <div className="mb-6">
        <Link href="/clinic" className="text-sm text-brand-600 hover:underline">
          ← Clinic
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Scan a file</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <ScanCapture />
      </div>
    </main>
  )
}
