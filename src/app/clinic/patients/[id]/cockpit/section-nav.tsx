'use client'

import { ChevronsDownUp, ChevronsUpDown, Flag, ListTree, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Every cockpit section, as a vertical list down the left of the page.
 *
 * Built from the page itself — each Accordion carries `data-section` — so the
 * list always matches what is on screen, including the sections that only
 * exist while a consultation is open. Clicking a heading opens that section
 * and scrolls to it; a dot marks the ones currently open, and a red count the
 * ones holding flagged entries. The list itself folds away.
 */

interface Entry {
  readonly id: string
  readonly title: string
  readonly flags: number
  readonly open: boolean
}

function readSections(): Entry[] {
  return [...document.querySelectorAll<HTMLDetailsElement>('details[data-section]')].map((el) => ({
    id: el.id,
    title: el.dataset.section ?? '',
    flags: Number(el.dataset.flags ?? 0),
    open: el.open,
  }))
}

export function SectionNav() {
  const [sections, setSections] = useState<Entry[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Only a real change re-renders; otherwise this list's own DOM updates
    // would feed the observer below forever.
    const refresh = () => {
      const next = readSections()
      setSections((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    refresh()
    // A section opened or closed by hand, or the page re-rendered after a save.
    document.addEventListener('toggle', refresh, true)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-flags'] })
    return () => {
      document.removeEventListener('toggle', refresh, true)
      observer.disconnect()
    }
  }, [])

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!(el instanceof HTMLDetailsElement)) return
    el.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const setAll = (open: boolean) => {
    document.querySelectorAll<HTMLDetailsElement>('details[data-section]').forEach((el) => {
      el.open = open
    })
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Show section list"
        title="Show section list"
        className="glass sticky top-3 flex items-center justify-center rounded-lg border border-slate-200/90 p-2 text-slate-600 shadow-2xs hover:text-brand-800"
      >
        <PanelLeftOpen aria-hidden className="h-4.5 w-4.5" />
      </button>
    )
  }

  return (
    <nav
      aria-label="Cockpit sections"
      className="glass sticky top-3 flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200/90 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2">
        <span className="font-heading flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-700 uppercase">
          <ListTree aria-hidden className="h-3.5 w-3.5 text-brand-600" />
          Sections
        </span>
        <span className="flex items-center gap-0.5">
          <IconButton label="Expand all" onClick={() => setAll(true)}>
            <ChevronsUpDown aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Collapse all" onClick={() => setAll(false)}>
            <ChevronsDownUp aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Hide section list" onClick={() => setCollapsed(true)}>
            <PanelLeftClose aria-hidden className="h-3.5 w-3.5" />
          </IconButton>
        </span>
      </div>
      <ol className="flex flex-col overflow-y-auto py-1">
        {sections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => go(section.id)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-brand-50/60 hover:text-brand-800"
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${section.open ? 'bg-brand-600' : 'bg-slate-300'}`}
              />
              <span className="min-w-0 flex-1 truncate">{section.title}</span>
              {section.flags > 0 ? (
                <span className="numeric flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-alert-700">
                  <Flag aria-hidden className="h-3 w-3 fill-alert-600 text-alert-600" />
                  {section.flags}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-800"
    >
      {children}
    </button>
  )
}
