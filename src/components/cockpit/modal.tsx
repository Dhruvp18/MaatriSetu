'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

/**
 * A dialog over the cockpit.
 *
 * Portalled to <body> for two reasons. The cockpit is a stack of <details>
 * elements with `overflow: hidden`, which would clip anything positioned inside
 * them; and several modals hold their own <form>, which must never end up
 * nested inside the consultation form — a nested form is invalid HTML and its
 * submit would post the wrong one.
 *
 * Escape and the backdrop both close it. Focus moves into the dialog on open
 * and back to whatever opened it on close, because the cockpit is driven from
 * the keyboard far more than from the mouse.
 */

const subscribe = () => () => {}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  // Portals need `document`; this is false during the server render.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  const width = size === 'md' ? 'max-w-lg' : size === 'xl' ? 'max-w-5xl' : 'max-w-3xl'

  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`glass-raised relative my-auto flex max-h-[calc(100vh-2rem)] w-full ${width} flex-col overflow-hidden rounded-xl border border-slate-200 shadow-xl outline-none`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-bold text-slate-900 sm:text-base">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
