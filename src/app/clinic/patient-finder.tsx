'use client'

import { Loader2, QrCode, Search, UserPlus } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'

import { type FoundPatient, searchPatientsAction } from './home-actions'
import { CameraScan } from './scan/camera-scan'

/**
 * Find a patient by name, file number or phone — or scan her card — and land
 * directly in her cockpit.
 *
 * Results arrive as you type. Enter opens the highlighted one. A role that
 * cannot open the cockpit (an assistant) is taken to report intake instead.
 */

export function PatientFinder({
  canRegister,
  canScan,
  openTarget,
}: {
  canRegister: boolean
  canScan: boolean
  /** Where a chosen patient opens. */
  openTarget: 'cockpit' | 'reports'
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly FoundPatient[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [scanOpen, setScanOpen] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchPatientsAction(q)
        if (result.ok) {
          setResults(result.patients)
          setError(null)
        } else setError(result.message)
        setActive(0)
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  const hrefFor = (id: string) =>
    (openTarget === 'cockpit' ? `/clinic/patients/${id}/cockpit` : `/clinic/patients/${id}/reports`) as Route

  return (
    <section className="glass rounded-xl border border-slate-200 p-4 shadow-xs">
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && results[active]) {
                router.push(hrefFor(results[active].id))
              }
            }}
            placeholder="Find a patient — name, UHID / file number, or phone"
            aria-label="Find a patient"
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-9 pl-10 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
          />
          {pending ? (
            <Loader2 aria-hidden className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
          ) : null}

          {query.trim().length >= 2 && !pending ? (
            <ul className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">
                  {error ?? 'No patient matches.'}{' '}
                  {canRegister && !error ? (
                    <Link href="/clinic/patients/new" className="font-semibold text-brand-700 hover:underline">
                      Register a new patient
                    </Link>
                  ) : null}
                </li>
              ) : (
                results.map((patient, index) => (
                  <li key={patient.id}>
                    <Link
                      href={hrefFor(patient.id)}
                      onMouseEnter={() => setActive(index)}
                      className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                        index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-800'
                      }`}
                    >
                      <span className="font-semibold">{patient.fullName}</span>
                      <span className="numeric text-xs text-slate-500">
                        {patient.uhid}
                        {patient.age !== null ? ` · ${patient.age}Y` : ''}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>

        <div className="flex gap-2">
          {canScan ? (
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-800 hover:bg-brand-100 md:flex-none"
            >
              <QrCode aria-hidden className="h-4.5 w-4.5" />
              Scan QR
            </button>
          ) : null}
          {canRegister ? (
            <Link
              href="/clinic/patients/new"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 md:flex-none"
            >
              <UserPlus aria-hidden className="h-4.5 w-4.5" />
              New patient
            </Link>
          ) : null}
        </div>
      </div>

      <Modal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        size="md"
        title="Scan her card"
        subtitle="Opens her cockpit directly."
      >
        <div className="flex flex-col gap-3">
          <CameraScan />
          <p className="text-[11px] text-slate-500">
            Using a desk scanner?{' '}
            <Link href="/clinic/scan" className="font-semibold text-brand-700 hover:underline">
              Open the scanner page
            </Link>{' '}
            and scan — it types the code and submits by itself.
          </p>
        </div>
      </Modal>
    </section>
  )
}
