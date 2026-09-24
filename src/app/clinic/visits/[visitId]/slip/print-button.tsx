'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * The only interactive thing on the slip page.
 *
 * A client component for one reason — `window.print()` — and kept in its own
 * file so the slip itself stays a server component and does its reads on the
 * server, in one pass, the way the cockpit does.
 *
 * It carries `no-print` as well as being a `button`: the base print rule hides
 * buttons, and the slip's own rule removes everything outside the slip, but
 * this is the control that triggers the print and it must not appear on the
 * sheet under any of them.
 */
export function PrintButton() {
  const searchParams = useSearchParams()
  const shouldPrint = searchParams.get('print') === 'true'

  useEffect(() => {
    if (shouldPrint) {
      const timer = setTimeout(() => window.print(), 100)
      return () => clearTimeout(timer)
    }
  }, [shouldPrint])

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
    >
      Print slip
    </button>
  )
}
