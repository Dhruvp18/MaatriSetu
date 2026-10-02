'use client'

import { ChevronRight, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'
import {
  FIELD,
  RxLineEditor,
  type RxDraft,
  blankRx,
  fromFormulary,
  fromPackMedicine,
  toPackMedicine,
} from '@components/cockpit/rx-line'
import { TokenInput } from '@components/cockpit/token-input'
import {
  COUNSELLING,
  type CounsellingKey,
  type MasterPack,
  describePack,
} from '@modules/master-packs/master-pack.types'
import { CLINIC_FORMULARY } from '@modules/orders/formulary'
import { LAB_INVESTIGATIONS, SCAN_INVESTIGATIONS, searchInvestigations } from '@modules/orders/investigations'
import { describeFoodRelation, formatDosing } from '@modules/orders/order.types'

import { deleteMasterPackAction, listMasterPacksAction, saveMasterPackAction } from './actions'

/**
 * "My master packs" — where a doctor builds her own one-click sets.
 *
 * A list of her packs, like the Master tab of a hospital EMR, and an editor
 * holding any mix of medicines, lab and scan orders, counselling and advice.
 * Packs are hers alone; nobody else at the clinic sees them.
 *
 * Opened from the profile menu on any clinic page, and from the pack strip at
 * the foot of the cockpit.
 */

interface Draft {
  packId: string | null
  expectedVersion: number | null
  name: string
  medicines: RxDraft[]
  labOrders: string[]
  scanOrders: string[]
  counselling: CounsellingKey[]
  advice: string
}

const emptyDraft = (): Draft => ({
  packId: null,
  expectedVersion: null,
  name: '',
  medicines: [],
  labOrders: [],
  scanOrders: [],
  counselling: [],
  advice: '',
})

const draftOf = (pack: MasterPack): Draft => ({
  packId: pack.id,
  expectedVersion: pack.version,
  name: pack.name,
  medicines: pack.medicines.map(fromPackMedicine),
  labOrders: [...pack.labOrders],
  scanOrders: [...pack.scanOrders],
  counselling: [...pack.counselling],
  advice: pack.advice ?? '',
})

export function PackManager({
  open,
  onClose,
  initialPacks,
  startWith,
}: {
  open: boolean
  onClose: () => void
  /** Already on the page (the cockpit has them); otherwise fetched on open. */
  initialPacks?: readonly MasterPack[]
  /** Open straight into a new pack's editor. */
  startWith?: 'NEW'
}) {
  const router = useRouter()
  const [packs, setPacks] = useState<readonly MasterPack[] | null>(initialPacks ?? null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reload = () =>
    listMasterPacksAction().then((result) => {
      if (result.ok) setPacks(result.value)
      else setError(result.message)
    })

  useEffect(() => {
    if (!open) return
    setError(null)
    setDraft(startWith === 'NEW' ? emptyDraft() : null)
    if (initialPacks) setPacks(initialPacks)
    else void reload()
    // Only on opening: later prop changes must not throw away an edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const save = () => {
    if (!draft) return
    setError(null)
    startTransition(async () => {
      const result = await saveMasterPackAction({
        packId: draft.packId,
        expectedVersion: draft.expectedVersion,
        pack: {
          name: draft.name,
          medicines: draft.medicines.map(toPackMedicine).filter((line) => line !== null),
          labOrders: draft.labOrders,
          scanOrders: draft.scanOrders,
          counselling: draft.counselling,
          advice: draft.advice.trim() || null,
        },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setDraft(null)
      await reload()
      router.refresh()
    })
  }

  const remove = (pack: MasterPack) => {
    if (!window.confirm(`Delete the pack “${pack.name}”? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteMasterPackAction({ packId: pack.id, expectedVersion: pack.version })
      if (!result.ok) {
        setError(result.message)
        return
      }
      await reload()
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <Package aria-hidden className="h-4.5 w-4.5 text-brand-600" />
          {draft ? (draft.packId ? `Edit pack — ${draft.name || 'untitled'}` : 'New master pack') : 'My master packs'}
        </span>
      }
      subtitle="Your own one-click sets. Private to you — nobody else at the clinic sees them."
      footer={
        draft ? (
          <>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save pack'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="flex items-center gap-1 rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New pack
          </button>
        )
      }
    >
      {error ? (
        <p role="alert" className="mb-2.5 rounded border border-alert-200 bg-alert-50 px-3 py-2 text-xs text-alert-700">
          {error}
        </p>
      ) : null}

      {draft ? (
        <PackEditor draft={draft} onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))} />
      ) : packs === null ? (
        <p className="text-xs text-slate-500">Loading your packs…</p>
      ) : packs.length === 0 ? (
        <p className="text-xs text-slate-500">
          You have no packs. Press <strong>New pack</strong> to make one — a set of medicines, tests and advice you
          write often.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200/80">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-10 px-2.5 py-1.5">No.</th>
                <th className="px-2.5 py-1.5">Pack</th>
                <th className="hidden px-2.5 py-1.5 sm:table-cell">Holds</th>
                <th className="w-20 px-2.5 py-1.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack, index) => (
                <PackRow
                  key={pack.id}
                  index={index}
                  pack={pack}
                  expanded={expanded === pack.id}
                  onToggle={() => setExpanded((id) => (id === pack.id ? null : pack.id))}
                  onEdit={() => setDraft(draftOf(pack))}
                  onDelete={() => remove(pack)}
                  disabled={pending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function PackRow({
  index,
  pack,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: {
  index: number
  pack: MasterPack
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  disabled: boolean
}) {
  return (
    <>
      <tr className="border-t border-slate-100 bg-white">
        <td className="px-2.5 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide contents' : 'Show contents'}
            className="numeric flex items-center gap-0.5 text-slate-500 hover:text-brand-800"
          >
            <ChevronRight aria-hidden className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            {index + 1}
          </button>
        </td>
        <td className="px-2.5 py-1.5 font-semibold text-slate-900">{pack.name}</td>
        <td className="hidden px-2.5 py-1.5 text-slate-500 sm:table-cell">{describePack(pack)}</td>
        <td className="px-2.5 py-1.5">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`Edit ${pack.name}`}
              className="rounded p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              aria-label={`Delete ${pack.name}`}
              className="rounded p-1 text-slate-500 hover:bg-alert-50 hover:text-alert-700 disabled:opacity-50"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-slate-50/70">
          <td />
          <td colSpan={3} className="px-2.5 pt-1 pb-2.5">
            <PackContents pack={pack} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

/** A pack's contents, read-only, in the prescription pad's notation. */
export function PackContents({ pack }: { pack: MasterPack }) {
  const counselling = COUNSELLING.filter((c) => pack.counselling.includes(c.key)).map((c) => c.label)
  return (
    <div className="flex flex-col gap-1.5 text-[11px] text-slate-700">
      {pack.medicines.length > 0 ? (
        <ul className="numeric flex flex-col gap-0.5">
          {pack.medicines.map((line, i) => (
            <li key={i}>
              <span className="font-semibold text-slate-900">
                {line.form ? `${line.form} ` : ''}
                {line.medicineName}
                {line.doseAmount !== null ? ` ${line.doseAmount} ${line.doseUnit}` : ''}
              </span>
              <span className="text-slate-500">
                {' · '}
                {formatDosing(line.frequency)}
                {describeFoodRelation(line.foodRelation) ? ` · ${describeFoodRelation(line.foodRelation)}` : ''}
                {line.durationDays !== null ? ` · ${line.durationDays} days` : ''}
                {line.instructions ? ` · ${line.instructions}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {pack.labOrders.length > 0 ? (
        <p>
          <span className="font-semibold text-slate-600">Labs: </span>
          {pack.labOrders.join(', ')}
        </p>
      ) : null}
      {pack.scanOrders.length > 0 ? (
        <p>
          <span className="font-semibold text-slate-600">Scans: </span>
          {pack.scanOrders.join(', ')}
        </p>
      ) : null}
      {counselling.length > 0 ? (
        <p>
          <span className="font-semibold text-slate-600">Counselling: </span>
          {counselling.join(', ')}
        </p>
      ) : null}
      {pack.advice ? (
        <p>
          <span className="font-semibold text-slate-600">Advice: </span>
          {pack.advice}
        </p>
      ) : null}
    </div>
  )
}

function PackEditor({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const updateLine = (key: number, patch: Partial<RxDraft>) =>
    onChange({ medicines: draft.medicines.map((row) => (row.key === key ? { ...row, ...patch } : row)) })

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="pack-name" className="mb-1 block text-[11px] font-medium text-slate-600">
          Pack name
        </label>
        <input
          id="pack-name"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="ANC profile, Anaemia, Pre-op routine…"
          maxLength={80}
          autoFocus
          className={FIELD}
        />
      </div>

      <section className="flex flex-col gap-2 rounded-lg border border-slate-200/90 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="font-heading text-xs font-bold tracking-wider text-slate-800 uppercase">Medicines</span>
          <button
            type="button"
            onClick={() => onChange({ medicines: [...draft.medicines, blankRx()] })}
            className="flex items-center gap-1 rounded border border-brand-200/70 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800 hover:bg-brand-100"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add medicine
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {CLINIC_FORMULARY.map((item) => {
            const added = draft.medicines.some(
              (row) => row.medicineName.trim().toLowerCase() === item.medicineName.toLowerCase(),
            )
            return (
              <button
                key={item.id}
                type="button"
                disabled={added}
                onClick={() => onChange({ medicines: [...draft.medicines, fromFormulary(item)] })}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-default disabled:border-brand-200 disabled:bg-brand-100 disabled:text-brand-800"
              >
                {added ? '✓ ' : '+ '}
                {item.form} {item.medicineName}
              </button>
            )
          })}
        </div>

        {draft.medicines.length === 0 ? (
          <p className="text-xs text-slate-500">No medicines in this pack.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {draft.medicines.map((rx, index) => (
              <RxLineEditor
                key={rx.key}
                index={index}
                rx={rx}
                onChange={(patch) => updateLine(rx.key, patch)}
                onRemove={() => onChange({ medicines: draft.medicines.filter((row) => row.key !== rx.key) })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200/90 bg-white p-3 md:grid-cols-2">
        <TokenInput
          id="pack-labs"
          label="Lab orders"
          values={draft.labOrders}
          onChange={(labOrders) => onChange({ labOrders })}
          search={(query, exclude) =>
            searchInvestigations(LAB_INVESTIGATIONS, query, exclude).map((item) => ({
              value: item.name,
              detail: item.detail,
            }))
          }
          placeholder="Type to search — c → CBC"
        />
        <TokenInput
          id="pack-scans"
          label="Scan orders"
          values={draft.scanOrders}
          onChange={(scanOrders) => onChange({ scanOrders })}
          search={(query, exclude) =>
            searchInvestigations(SCAN_INVESTIGATIONS, query, exclude).map((item) => ({
              value: item.name,
              detail: item.detail,
            }))
          }
          placeholder="Type to search — g → Growth scan"
        />

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[11px] font-medium text-slate-600">Counselling</legend>
          {COUNSELLING.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center gap-2 rounded border border-slate-200/60 bg-slate-50 p-1.5 text-xs text-slate-700 hover:bg-slate-100/60"
            >
              <input
                type="checkbox"
                checked={draft.counselling.includes(item.key)}
                onChange={(e) =>
                  onChange({
                    counselling: e.target.checked
                      ? [...draft.counselling, item.key]
                      : draft.counselling.filter((key) => key !== item.key),
                  })
                }
                className="h-3.5 w-3.5 shrink-0 accent-brand-600"
              />
              <span className="font-medium">{item.label}</span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="pack-advice" className="mb-1 block text-[11px] font-medium text-slate-600">
            Other advice
          </label>
          <textarea
            id="pack-advice"
            rows={4}
            value={draft.advice}
            onChange={(e) => onChange({ advice: e.target.value })}
            maxLength={2000}
            placeholder="Plenty of fluids, iron-rich diet, review with reports."
            className={FIELD}
          />
        </div>
      </section>
    </div>
  )
}
