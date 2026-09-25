'use client'

import { ChevronDown, ChevronUp, ListFilter, Search } from 'lucide-react'
import { Fragment, useState } from 'react'

/**
 * "View all" for a significant-results section.
 *
 * The section itself shows only what a doctor flagged. This is the small button
 * in its corner that opens everything on file, newest first, with a search by
 * name. The rows arrive already rendered by the page, so each keeps whatever
 * actions it carries.
 */

export interface ViewAllItem {
  readonly id: string
  /** What the search matches against, e.g. `Haemoglobin` or `Growth scan`. */
  readonly name: string
  /** ISO date; the list is sorted newest first on it. */
  readonly date: string
  /** The row itself — an `<li>`, since the list here is a `<ul>`. */
  readonly node: React.ReactNode
}

export function ViewAllList({
  items,
  noun,
  layout = 'list',
}: {
  items: readonly ViewAllItem[]
  /** `results`, `scans` — for the button and the empty-search message. */
  noun: string
  layout?: 'list' | 'grid'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  if (items.length === 0) return null

  const q = query.trim().toLowerCase()
  const shown = [...items]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((item) => !q || item.name.toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand-200 hover:text-brand-800"
        >
          <ListFilter aria-hidden className="h-3.5 w-3.5" />
          {open ? 'Hide' : 'View all'} ({items.length})
          {open ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200/70 bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
              All {noun} · newest first
            </span>
            <label className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault()
                }}
                placeholder="Search by name"
                aria-label={`Search ${noun} by name`}
                className="w-44 rounded border border-slate-300 bg-white/80 py-1 pr-2 pl-7 text-[11px] text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </label>
          </div>
          {shown.length === 0 ? (
            <p className="text-xs text-slate-500">No {noun} match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className={layout === 'grid' ? 'grid grid-cols-1 gap-2.5 md:grid-cols-3' : 'flex flex-col gap-2'}>
              {shown.map((item) => (
                <Fragment key={item.id}>{item.node}</Fragment>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
