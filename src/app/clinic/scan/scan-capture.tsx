'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { resolveScan, type ScanState } from './actions'

/**
 * Capture from a barcode scanner, or from the keyboard.
 *
 * ---------------------------------------------------------------------------
 * How a 2D scanner actually behaves
 * ---------------------------------------------------------------------------
 * The HID scanners used at hospital counters are keyboard wedges: they type the
 * decoded characters as fast as the OS will accept them, then send Enter. There
 * is no device API to talk to and nothing to pair — which is exactly why the
 * PRD chose them, because they work with no driver and no camera permission.
 *
 * So the whole implementation is: keep a text input focused, and submit on
 * Enter. The work is in never losing focus, because a scan that lands on the
 * page instead of in the field does nothing at all and the doctor has no idea
 * why.
 *
 * The field is `type="password"`. Not for secrecy from the user — it stops the
 * browser offering to save a token as an autofill suggestion and then proposing
 * the last patient's sticker to the next person who scans.
 */

const initialState: ScanState = { error: null }

function Status() {
  const { pending } = useFormStatus()
  if (!pending) return null

  return (
    <p className="text-sm text-slate-500" role="status">
      Opening the record…
    </p>
  )
}

export function ScanCapture() {
  const [state, formAction] = useActionState(resolveScan, initialState)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the field focused. A counter machine is clicked constantly — on a
  // notification, on the page background, on nothing in particular — and any of
  // those would silently send the next scan into the void.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    input.focus()

    const refocus = () => {
      // Don't steal focus from someone deliberately using another control.
      const active = document.activeElement
      const interactive =
        active instanceof HTMLElement &&
        active !== input &&
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(active.tagName)

      if (!interactive) input.focus()
    }

    const timer = window.setInterval(refocus, 700)
    document.addEventListener('click', refocus)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('click', refocus)
    }
  }, [])

  // Clear the field after a failed scan so the next one starts clean. A partial
  // read left behind concatenates with the next scan and fails again, which
  // looks like a broken scanner rather than a stale field.
  useEffect(() => {
    if (state.error && inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.focus()
    }
  }, [state])

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-slate-700">
          Scan the file sticker
        </label>
        <input
          ref={inputRef}
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // The scanner sends Enter itself, which submits the form natively.
          // Typing the code by hand and pressing Enter does the same thing.
          placeholder="Waiting for a scan…"
          className="numeric w-full rounded-lg border-2 border-brand-600 bg-white px-3 py-3 text-sm tracking-widest text-slate-900 outline-none focus:ring-2 focus:ring-brand-600/30"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Point the scanner at the sticker — it types the code and opens the
          record. If the sticker will not read, type the code printed under it,
          or{' '}
          <Link href="/clinic/patients" className="text-brand-600 hover:underline">
            search for her by name
          </Link>
          .
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.error}
        </p>
      ) : null}

      <Status />

      {/*
        Present for keyboard and touch use; a scanner never needs it. Not hidden,
        because a tablet user with an on-screen keyboard has no Enter key in
        every layout.
      */}
      <button
        type="submit"
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
      >
        Open record
      </button>
    </form>
  )
}
