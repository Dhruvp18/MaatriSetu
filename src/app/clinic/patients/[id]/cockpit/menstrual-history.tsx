'use client'

import { CalendarHeart, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'
import {
  BOWEL_BLADDER_LABELS,
  CYCLE_REGULARITY_LABELS,
  FLOW_LABELS,
  PMS_EMOTIONAL_OPTIONS,
  PMS_PHYSICAL_OPTIONS,
  type BowelBladder,
  type CycleRegularity,
  type MenstrualFlow,
  type MenstrualHistoryRecord,
  type YesNo,
  describeRecordedList,
  describeYesNo,
} from '@modules/history/history.types'

import { saveMenstrualHistoryAction } from './history-actions'
import { Detail, FIELD, Field, MultiWithNone, Section, YesNoRow, toIntOrNull } from './history-fields'

/**
 * Previous menstrual history.
 *
 * Each history taken is one dated row, newest first, shown as it was recorded.
 * A row opens the full record, which can be corrected; a new history can be
 * taken at any visit. The fields are the OPD form's Menstrual Examination
 * block.
 */

const yesNoToBool = (value: YesNo): boolean | null => (value === 'NOT_RECORDED' ? null : value === 'YES')

const cycleLine = (entry: MenstrualHistoryRecord) => {
  const parts = [
    entry.cycleLengthDays !== null || entry.durationDays !== null
      ? `${entry.durationDays ?? '–'}/${entry.cycleLengthDays ?? '–'} days`
      : null,
    entry.cycleRegularity ? CYCLE_REGULARITY_LABELS[entry.cycleRegularity] : null,
    entry.flow ? `${FLOW_LABELS[entry.flow]} flow` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Cycle not recorded'
}

export function MenstrualHistoryPanel({
  patientId,
  history,
  canEdit,
}: {
  patientId: string
  history: readonly MenstrualHistoryRecord[]
  canEdit: boolean
}) {
  const [viewing, setViewing] = useState<MenstrualHistoryRecord | null>(null)
  const [editing, setEditing] = useState<MenstrualHistoryRecord | 'NEW' | null>(null)

  return (
    <div className="flex flex-col gap-2.5">
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center">
          <CalendarHeart aria-hidden className="h-6 w-6 text-slate-400" />
          <p className="text-xs text-slate-600">No menstrual history has been taken for her.</p>
          {canEdit ? <AddButton onClick={() => setEditing('NEW')} /> : null}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setViewing(entry)}
                  className="group flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <span className="numeric font-bold text-brand-800">{entry.recordedOn}</span>
                  <span className="numeric text-slate-700">LMP {entry.lmp ?? '—'}</span>
                  <span className="numeric text-slate-700">{cycleLine(entry)}</span>
                  {entry.menarcheAgeYears !== null ? (
                    <span className="numeric text-slate-500">menarche {entry.menarcheAgeYears} y</span>
                  ) : null}
                  {entry.bowelBladder && entry.bowelBladder !== 'NORMAL' ? (
                    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-700">
                      {BOWEL_BLADDER_LABELS[entry.bowelBladder].toLowerCase()}
                    </span>
                  ) : null}
                  {entry.dysmenorrhea === 'YES' ? (
                    <span className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-700">
                      dysmenorrhoea
                    </span>
                  ) : null}
                  <ChevronRight aria-hidden className="ml-auto h-4 w-4 text-slate-300 group-hover:text-brand-600" />
                </button>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="flex justify-end">
              <AddButton onClick={() => setEditing('NEW')} />
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `Menstrual history · taken ${viewing.recordedOn}` : ''}
        footer={
          viewing && canEdit ? (
            <button
              type="button"
              onClick={() => {
                setEditing(viewing)
                setViewing(null)
              }}
              className="flex items-center gap-1.5 rounded-md bg-brand-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null
        }
      >
        {viewing ? (
          <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Detail label="LMP" value={viewing.lmp} />
            <Detail label="Age at menarche" value={viewing.menarcheAgeYears !== null ? `${viewing.menarcheAgeYears} years` : null} />
            <Detail label="Duration" value={viewing.durationDays !== null ? `${viewing.durationDays} days` : null} />
            <Detail label="Frequency" value={viewing.cycleLengthDays !== null ? `every ${viewing.cycleLengthDays} days` : null} />
            <Detail label="Cycle regularity" value={viewing.cycleRegularity ? CYCLE_REGULARITY_LABELS[viewing.cycleRegularity] : null} />
            <Detail label="Flow" value={viewing.flow ? FLOW_LABELS[viewing.flow] : null} />
            <Detail label="Pads per day" value={viewing.padsPerDay} />
            <Detail label="Impact on activities" value={describeYesNo(viewing.impactsActivities)} />
            <Detail label="Dysmenorrhoea" value={describeYesNo(viewing.dysmenorrhea)} />
            <Detail label="Bowel / bladder" value={viewing.bowelBladder ? BOWEL_BLADDER_LABELS[viewing.bowelBladder] : null} />
            <div className="col-span-2 md:col-span-3">
              <Detail label="Premenstrual symptoms (emotional)" value={describeRecordedList(viewing.pmsEmotional)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Detail label="Premenstrual symptoms (physical)" value={describeRecordedList(viewing.pmsPhysical)} />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Detail label="Remarks" value={viewing.remarks} />
            </div>
          </dl>
        ) : null}
      </Modal>

      {editing ? (
        <MenstrualForm
          key={editing === 'NEW' ? 'new' : editing.id}
          patientId={patientId}
          entry={editing === 'NEW' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
    >
      <Plus aria-hidden className="h-3.5 w-3.5" />
      Add menstrual history
    </button>
  )
}

function MenstrualForm({
  patientId,
  entry,
  onClose,
}: {
  patientId: string
  entry: MenstrualHistoryRecord | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const num = (value: number | null) => (value !== null ? String(value) : '')
  const [lmp, setLmp] = useState(entry?.lmp ?? '')
  const [menarche, setMenarche] = useState(num(entry?.menarcheAgeYears ?? null))
  const [duration, setDuration] = useState(num(entry?.durationDays ?? null))
  const [cycle, setCycle] = useState(num(entry?.cycleLengthDays ?? null))
  const [regularity, setRegularity] = useState<CycleRegularity | ''>(entry?.cycleRegularity ?? '')
  const [flow, setFlow] = useState<MenstrualFlow | ''>(entry?.flow ?? '')
  const [pads, setPads] = useState(num(entry?.padsPerDay ?? null))
  const [pmsEmotional, setPmsEmotional] = useState<string[] | null>(
    entry && entry.pmsEmotional.kind === 'RECORDED' ? [...entry.pmsEmotional.items] : null,
  )
  const [pmsPhysical, setPmsPhysical] = useState<string[] | null>(
    entry && entry.pmsPhysical.kind === 'RECORDED' ? [...entry.pmsPhysical.items] : null,
  )
  const [impacts, setImpacts] = useState<boolean | null>(entry ? yesNoToBool(entry.impactsActivities) : null)
  const [dysmenorrhea, setDysmenorrhea] = useState<boolean | null>(entry ? yesNoToBool(entry.dysmenorrhea) : null)
  const [bowelBladder, setBowelBladder] = useState<BowelBladder | ''>(entry?.bowelBladder ?? '')
  const [remarks, setRemarks] = useState(entry?.remarks ?? '')

  const asOptions = (options: readonly string[]) => options.map((o) => [o, o] as const)

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveMenstrualHistoryAction({
        patientId,
        historyId: entry?.id ?? null,
        expectedVersion: entry?.version ?? null,
        entry: {
          lmp: lmp || null,
          menarcheAgeYears: toIntOrNull(menarche),
          durationDays: toIntOrNull(duration),
          cycleLengthDays: toIntOrNull(cycle),
          cycleRegularity: regularity || null,
          flow: flow || null,
          padsPerDay: toIntOrNull(pads),
          pmsEmotional,
          pmsPhysical,
          impactsActivities: impacts,
          dysmenorrhea,
          bowelBladder: bowelBladder || null,
          remarks: remarks || null,
        },
      })
      if (result.ok) onClose()
      else setError(result.message)
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Menstrual history"
      subtitle={entry ? `Correcting the history taken ${entry.recordedOn}.` : 'Dated today. Leave anything she was not asked blank.'}
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto text-[11px] text-alert-700">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save history'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Section title="Menstrual examination">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="LMP">
              <input type="date" value={lmp} onChange={(e) => setLmp(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
            <Field label="Age at menarche (yrs)">
              <input type="number" min={5} max={25} value={menarche} onChange={(e) => setMenarche(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
            <Field label="Duration (days)">
              <input type="number" min={1} max={20} value={duration} onChange={(e) => setDuration(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
            <Field label="Frequency (days)">
              <input type="number" min={10} max={180} value={cycle} onChange={(e) => setCycle(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
            <Field label="Cycle regularity">
              <select value={regularity} onChange={(e) => setRegularity(e.target.value as CycleRegularity | '')} className={FIELD}>
                <option value="">Cycle regularity…</option>
                {Object.entries(CYCLE_REGULARITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Flow">
              <select value={flow} onChange={(e) => setFlow(e.target.value as MenstrualFlow | '')} className={FIELD}>
                <option value="">Flow…</option>
                {Object.entries(FLOW_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pads per day">
              <input type="number" min={0} max={30} value={pads} onChange={(e) => setPads(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
          </div>
        </Section>

        <Section title="Premenstrual symptoms (emotional)">
          <MultiWithNone name="Premenstrual symptoms (emotional)" options={asOptions(PMS_EMOTIONAL_OPTIONS)} value={pmsEmotional} onChange={setPmsEmotional} />
        </Section>
        <Section title="Premenstrual symptoms (physical)">
          <MultiWithNone name="Premenstrual symptoms (physical)" options={asOptions(PMS_PHYSICAL_OPTIONS)} value={pmsPhysical} onChange={setPmsPhysical} />
        </Section>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Section title="Impact on activities">
            <YesNoRow name="Impact on activities" value={impacts} onChange={setImpacts} />
          </Section>
          <Section title="Presence of dysmenorrhoea">
            <YesNoRow name="Presence of dysmenorrhoea" value={dysmenorrhea} onChange={setDysmenorrhea} />
          </Section>
          <Section title="Bowel / bladder">
            <select
              value={bowelBladder}
              onChange={(e) => setBowelBladder(e.target.value as BowelBladder | '')}
              aria-label="Bowel / bladder"
              className={FIELD}
            >
              <option value="">Not asked</option>
              {Object.entries(BOWEL_BLADDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Section>
        </div>

        <Section title="Remarks">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={FIELD} />
        </Section>
      </div>
    </Modal>
  )
}
