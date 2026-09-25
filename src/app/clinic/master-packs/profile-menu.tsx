'use client'

import { Package } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { PackManager } from './pack-manager'

/**
 * The profile photo in the header, and the menu behind it.
 *
 * For a doctor it holds "My master packs"; for everyone else it only says who
 * is signed in and in what role, which the header already shows on wide screens.
 */
export function ProfileMenu({
  displayName,
  initials,
  role,
  canManagePacks,
}: {
  displayName: string
  initials: string
  role: string
  canManagePacks: boolean
}) {
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-600/20 bg-brand-600/10 text-xs font-bold text-brand-800 transition-colors hover:bg-brand-600/20"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 bg-slate-50/70 px-3 py-2">
            <p className="truncate text-xs font-semibold text-slate-900">{displayName}</p>
            <p className="text-[10.5px] text-slate-500">{role.toLowerCase()}</p>
          </div>
          {canManagePacks ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setManaging(true)
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-brand-50"
            >
              <Package aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>
                <span className="block text-xs font-semibold text-slate-900">My master packs</span>
                <span className="block text-[10.5px] text-slate-500">
                  Make and edit your one-click prescription sets
                </span>
              </span>
            </button>
          ) : (
            <p className="px-3 py-2 text-[10.5px] text-slate-500">Nothing to set up for your role.</p>
          )}
        </div>
      ) : null}

      {canManagePacks ? <PackManager open={managing} onClose={() => setManaging(false)} /> : null}
    </div>
  )
}
