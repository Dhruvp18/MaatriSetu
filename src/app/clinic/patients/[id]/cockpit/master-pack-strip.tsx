'use client'

import { ChevronRight, CornerDownRight, Package, Settings2, X } from 'lucide-react'
import { useState } from 'react'

import { type MasterPack, describePack } from '@modules/master-packs/master-pack.types'

import { PackContents, PackManager } from '../../../master-packs/pack-manager'

/**
 * The doctor's master packs, at the foot of the consultation.
 *
 * One click applies a pack to today's plan. What is already there is kept as
 * she wrote it and reported as skipped; everything that lands stays editable
 * above, and nothing is ordered until Save & Next.
 */

export interface ApplyNotice {
  readonly packName: string
  readonly added: readonly string[]
  readonly skipped: readonly string[]
}

export function MasterPackStrip({
  packs,
  onApply,
  notice,
  onDismissNotice,
}: {
  packs: readonly MasterPack[]
  onApply: (pack: MasterPack) => void
  notice: ApplyNotice | null
  onDismissNotice: () => void
}) {
  const [managing, setManaging] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const shown = q ? packs.filter((pack) => pack.name.toLowerCase().includes(q)) : packs

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-800 uppercase">
          <Package aria-hidden className="h-4 w-4 text-brand-600" />
          My master packs
          <span className="font-sans text-[10.5px] font-normal tracking-normal text-slate-500 normal-case">
            — one click adds the whole set to today&rsquo;s plan
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          {packs.length > 6 ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              placeholder="Search packs"
              aria-label="Search packs"
              className="w-36 rounded border border-slate-300 bg-white/80 px-2 py-1 text-[11px] outline-none focus:border-brand-600"
            />
          ) : null}
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-800"
          >
            <Settings2 aria-hidden className="h-3.5 w-3.5" />
            Manage
          </button>
        </div>
      </div>

      {notice ? (
        <div role="status" className="flex items-start gap-2 rounded border border-verified-200 bg-white px-2.5 py-1.5 text-[11px]">
          <p className="min-w-0 flex-1 text-slate-700">
            <strong className="font-semibold text-slate-900">Applied “{notice.packName}”.</strong>{' '}
            {notice.added.length > 0 ? `Added ${notice.added.length}: ${notice.added.join(', ')}.` : 'Nothing new to add.'}
            {notice.skipped.length > 0 ? (
              <span className="block text-caution-700">
                Skipped {notice.skipped.length} already in today&rsquo;s plan: {notice.skipped.join(', ')}.
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {packs.length === 0 ? (
        <p className="text-xs text-slate-500">
          You have no packs yet. Press <strong>Manage</strong>, or open your profile menu, to make one.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-500">No pack matches “{query}”.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((pack) => {
            const isOpen = expanded === pack.id
            return (
              <li key={pack.id} className="rounded-md border border-slate-200/80 bg-white">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : pack.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Hide ${pack.name}` : `Show what ${pack.name} holds`}
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:text-brand-800"
                  >
                    <ChevronRight aria-hidden className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-900">{pack.name}</span>
                    <span className="block truncate text-[10.5px] text-slate-500">{describePack(pack)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onApply(pack)}
                    title={`Apply ${pack.name} to today's plan`}
                    className="flex shrink-0 items-center gap-1 rounded bg-brand-800 px-2 py-1 text-[10.5px] font-bold text-white hover:bg-brand-700"
                  >
                    <CornerDownRight aria-hidden className="h-3.5 w-3.5" />
                    Apply
                  </button>
                </div>
                {isOpen ? (
                  <div className="border-t border-slate-100 px-2.5 py-2">
                    <PackContents pack={pack} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <PackManager open={managing} onClose={() => setManaging(false)} initialPacks={packs} />
    </section>
  )
}
