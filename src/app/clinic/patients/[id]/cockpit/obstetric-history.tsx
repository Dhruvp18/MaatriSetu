'use client'

import { Baby, Pencil, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'
import {
  BABY_POSITIONS,
  CONCEPTION_LABELS,
  DELIVERY_MODE_LABELS,
  GESTATION_LABELS,
  INDUCED_COMPLICATION_LABELS,
  INFANT_OUTCOME_LABELS,
  INFANT_SEX_LABELS,
  PLURALITY_COUNT,
  PLURALITY_LABELS,
  PRIOR_OUTCOME_LABELS,
  RELATED_COMPLICATION_LABELS,
  type ConceptionMode,
  type DeliveryMode,
  type GestationCategory,
  type InducedComplication,
  type InfantOutcome,
  type InfantSex,
  type ObstetricHistoryRecord,
  type Plurality,
  type PriorOutcome,
  type RelatedComplication,
  describeChildren,
  describeDeliveryMode,
  describeGestationAtDelivery,
  describeRecordedList,
  obstetricHistoryDate,
} from '@modules/history/history.types'

import { saveObstetricHistoryAction } from './history-actions'
import { DictatedTextarea } from './dictated-textarea'
import { HistoryDelete } from './history-delete'
import { HistoryFlag } from './history-flag'
import {
  Detail,
  FIELD,
  Field,
  MultiWithNone,
  RadioRow,
  Section,
  toIntOrNull,
  toNumberOrNull,
} from './history-fields'

/**
 * Previous obstetric history.
 *
 * Past pregnancies are shown as they were recorded, one summary row each — the
 * same columns as the paper form's summary strip. A row opens the full record;
 * the record can be corrected, and a new pregnancy can be added. A patient with
 * nothing recorded gets an Add button rather than an empty table, because "no
 * rows" is not the same statement as "primigravida" and the screen must not
 * suggest it is.
 */

const entries = <K extends string>(labels: Record<K, string>) =>
  Object.entries(labels) as Array<[K, string]>

export function ObstetricHistoryPanel({
  patientId,
  history,
  canEdit,
}: {
  patientId: string
  history: readonly ObstetricHistoryRecord[]
  canEdit: boolean
}) {
  const [viewing, setViewing] = useState<ObstetricHistoryRecord | null>(null)
  const [editing, setEditing] = useState<ObstetricHistoryRecord | 'NEW' | null>(null)

  const nextGravida = (history.at(-1)?.sequenceNo ?? 0) + 1

  return (
    <div className="flex flex-col gap-2.5">
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center">
          <Baby aria-hidden className="h-6 w-6 text-slate-400" />
          <p className="text-xs text-slate-600">No previous pregnancies are recorded for her.</p>
          {canEdit ? (
            <AddButton onClick={() => setEditing('NEW')} label="Add previous pregnancy" />
          ) : null}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-2.5 py-2">Summary</th>
                  <th className="px-2.5 py-2">Past obstetric history</th>
                  <th className="px-2.5 py-2">Gestational age at delivery</th>
                  <th className="px-2.5 py-2">Pregnancy induced complication</th>
                  <th className="px-2.5 py-2">Pregnancy related complication</th>
                  <th className="px-2.5 py-2">No. of children born</th>
                  <th className="px-2.5 py-2 text-right">{canEdit ? 'Action' : <span className="sr-only">Flag</span>}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setViewing(entry)}
                    className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-brand-50/50 ${
                      entry.flagged ? 'bg-alert-50/50' : 'bg-white'
                    }`}
                  >
                    <td className="px-2.5 py-2 align-top">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewing(entry)
                        }}
                        className="text-left"
                      >
                        <span className="numeric block font-bold text-brand-800">Gravida {entry.sequenceNo}</span>
                        <span className="numeric block text-[11px] text-slate-500">{obstetricHistoryDate(entry)}</span>
                      </button>
                    </td>
                    <td className="px-2.5 py-2 align-top text-slate-800">
                      {[
                        entry.conceptionMode ? CONCEPTION_LABELS[entry.conceptionMode] : null,
                        describeDeliveryMode(entry),
                        entry.outcome !== 'UNKNOWN' ? PRIOR_OUTCOME_LABELS[entry.outcome] : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || <span className="text-slate-400">Not recorded</span>}
                      {entry.hasUterineScar ? (
                        <span className="ml-1.5 rounded border border-caution-200 bg-caution-50 px-1 text-[10px] font-bold text-caution-900">
                          scar
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2.5 py-2 align-top text-slate-800">{describeGestationAtDelivery(entry)}</td>
                    <td className="px-2.5 py-2 align-top text-slate-800">
                      {describeRecordedList(entry.inducedComplications, INDUCED_COMPLICATION_LABELS)}
                    </td>
                    <td className="px-2.5 py-2 align-top text-slate-800">
                      {describeRecordedList(entry.relatedComplications, RELATED_COMPLICATION_LABELS)}
                    </td>
                    <td className="px-2.5 py-2 align-top text-slate-800">{describeChildren(entry)}</td>
                    <td className="px-2.5 py-2 text-right align-top">
                      <span className="inline-flex items-center gap-1">
                        <HistoryFlag
                          patientId={patientId}
                          kind="OBSTETRIC"
                          entryId={entry.id}
                          flagged={entry.flagged}
                          canEdit={canEdit}
                          label={`gravida ${entry.sequenceNo}`}
                        />
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditing(entry)
                            }}
                            aria-label={`Edit gravida ${entry.sequenceNo}`}
                            title="Edit"
                            className="rounded border border-caution-200 bg-caution-50 p-1 text-caution-700 hover:bg-caution-100"
                          >
                            <Pencil aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <HistoryDelete
                          patientId={patientId}
                          kind="OBSTETRIC"
                          entryId={entry.id}
                          canEdit={canEdit}
                          label={`gravida ${entry.sequenceNo}`}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit ? (
            <div className="flex justify-end">
              <AddButton onClick={() => setEditing('NEW')} label={`Add gravida ${nextGravida}`} />
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        size="xl"
        title={viewing ? `Gravida ${viewing.sequenceNo} · ${obstetricHistoryDate(viewing)}` : ''}
        subtitle="Past obstetric history, as recorded."
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
        {viewing ? <HistoryDetail entry={viewing} /> : null}
      </Modal>

      {editing ? (
        <HistoryForm
          key={editing === 'NEW' ? 'new' : editing.id}
          patientId={patientId}
          entry={editing === 'NEW' ? null : editing}
          gravida={editing === 'NEW' ? nextGravida : editing.sequenceNo}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
    >
      <Plus aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Read-only detail                                                           */
/* -------------------------------------------------------------------------- */

function HistoryDetail({ entry }: { entry: ObstetricHistoryRecord }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Detail
          label="Conception"
          value={
            entry.conceptionMode
              ? `${CONCEPTION_LABELS[entry.conceptionMode]}${entry.conceptionRemarks ? ` — ${entry.conceptionRemarks}` : ''}`
              : null
          }
        />
        <Detail label="Date of delivery" value={entry.eventDate ?? entry.yearOfEvent} />
        <Detail label="Type of delivery" value={describeDeliveryMode(entry)} />
        <Detail label="Baby's position" value={entry.babyPosition} />
        <Detail label="Outcome" value={entry.outcome !== 'UNKNOWN' ? PRIOR_OUTCOME_LABELS[entry.outcome] : null} />
        <Detail label="Gestational age at delivery" value={describeGestationAtDelivery(entry)} />
        <Detail label="Place of delivery" value={entry.placeOfEvent} />
        <Detail
          label="Uterine scar"
          value={entry.hasUterineScar ? `Yes${entry.scarIndication ? ` — ${entry.scarIndication}` : ''}` : 'No'}
        />
      </dl>
      <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Detail
          label="Pregnancy induced complication"
          value={`${describeRecordedList(entry.inducedComplications, INDUCED_COMPLICATION_LABELS)}${
            entry.inducedComplicationsRemarks ? ` — ${entry.inducedComplicationsRemarks}` : ''
          }`}
        />
        <Detail
          label="Pregnancy related complication"
          value={`${describeRecordedList(entry.relatedComplications, RELATED_COMPLICATION_LABELS)}${
            entry.relatedComplicationsRemarks ? ` — ${entry.relatedComplicationsRemarks}` : ''
          }`}
        />
        <Detail label="Number of children born" value={describeChildren(entry)} />
        <Detail label="Remarks" value={entry.remarks} />
      </dl>

      {entry.infants.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {entry.infants.map((infant) => (
            <div key={infant.fetusNo} className="rounded-lg border border-slate-200 p-2.5">
              <p className="font-heading mb-1.5 text-[11px] font-bold tracking-wide text-slate-800 uppercase">
                Fetus {infant.fetusNo}
              </p>
              <dl className="grid grid-cols-2 gap-1.5">
                <Detail
                  label="Delivery outcome"
                  value={
                    infant.outcome
                      ? `${INFANT_OUTCOME_LABELS[infant.outcome]}${infant.outcomeRemarks ? ` — ${infant.outcomeRemarks}` : ''}`
                      : null
                  }
                />
                <Detail
                  label="Delivered"
                  value={infant.deliveredOn ? `${infant.deliveredOn}${infant.deliveredTime ? ` ${infant.deliveredTime}` : ''}` : null}
                />
                <Detail
                  label="Birth weight"
                  value={infant.birthWeightGrams !== null ? `${(infant.birthWeightGrams / 1000).toFixed(2)} kg` : null}
                />
                <Detail label="Gender" value={infant.sex ? INFANT_SEX_LABELS[infant.sex] : null} />
                <Detail
                  label="APGAR 1 / 5 / 10 min"
                  value={
                    [infant.apgar1Min, infant.apgar5Min, infant.apgar10Min].some((a) => a !== null)
                      ? [infant.apgar1Min, infant.apgar5Min, infant.apgar10Min].map((a) => a ?? '–').join(' / ')
                      : null
                  }
                />
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

interface InfantDraft {
  outcome: InfantOutcome | null
  outcomeRemarks: string
  deliveredOn: string
  deliveredTime: string
  birthWeightKg: string
  sex: InfantSex | null
  apgar1Min: string
  apgar5Min: string
  apgar10Min: string
}

const blankInfant = (deliveredOn = ''): InfantDraft => ({
  outcome: null,
  outcomeRemarks: '',
  deliveredOn,
  deliveredTime: '',
  birthWeightKg: '',
  sex: null,
  apgar1Min: '',
  apgar5Min: '',
  apgar10Min: '',
})

function HistoryForm({
  patientId,
  entry,
  gravida,
  onClose,
}: {
  patientId: string
  entry: ObstetricHistoryRecord | null
  gravida: number
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [conception, setConception] = useState<ConceptionMode | null>(entry?.conceptionMode ?? null)
  const [conceptionRemarks, setConceptionRemarks] = useState(entry?.conceptionRemarks ?? '')
  const [eventDate, setEventDate] = useState(entry?.eventDate ?? '')
  const [yearOfEvent, setYearOfEvent] = useState(
    entry?.eventDate ? '' : entry?.yearOfEvent != null ? String(entry.yearOfEvent) : '',
  )
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(entry?.deliveryMode ?? 'UNKNOWN')
  const [outcome, setOutcome] = useState<PriorOutcome>(entry?.outcome ?? 'UNKNOWN')
  const [babyPosition, setBabyPosition] = useState(entry?.babyPosition ?? '')
  const [gestation, setGestation] = useState<GestationCategory | null>(entry?.gestationCategory ?? null)
  const [gestationWeeks, setGestationWeeks] = useState(
    entry?.gestationWeeksAtDelivery != null ? String(entry.gestationWeeksAtDelivery) : '',
  )
  const [induced, setInduced] = useState<InducedComplication[] | null>(
    entry && entry.inducedComplications.kind === 'RECORDED' ? [...entry.inducedComplications.items] : null,
  )
  const [inducedRemarks, setInducedRemarks] = useState(entry?.inducedComplicationsRemarks ?? '')
  const [related, setRelated] = useState<RelatedComplication[] | null>(
    entry && entry.relatedComplications.kind === 'RECORDED' ? [...entry.relatedComplications.items] : null,
  )
  const [relatedRemarks, setRelatedRemarks] = useState(entry?.relatedComplicationsRemarks ?? '')
  const [plurality, setPlurality] = useState<Plurality | null>(entry?.plurality ?? null)
  const [pluralityOther, setPluralityOther] = useState(entry?.pluralityOther ?? '')
  const [hasScar, setHasScar] = useState(entry?.hasUterineScar ?? false)
  const [scarIndication, setScarIndication] = useState(entry?.scarIndication ?? '')
  const [place, setPlace] = useState(entry?.placeOfEvent ?? '')
  const [remarks, setRemarks] = useState(entry?.remarks ?? '')
  const [infants, setInfants] = useState<InfantDraft[]>(
    entry && entry.infants.length > 0
      ? entry.infants.map((infant) => ({
          outcome: infant.outcome,
          outcomeRemarks: infant.outcomeRemarks ?? '',
          deliveredOn: infant.deliveredOn ?? '',
          deliveredTime: infant.deliveredTime ?? '',
          birthWeightKg: infant.birthWeightGrams !== null ? String(infant.birthWeightGrams / 1000) : '',
          sex: infant.sex,
          apgar1Min: infant.apgar1Min !== null ? String(infant.apgar1Min) : '',
          apgar5Min: infant.apgar5Min !== null ? String(infant.apgar5Min) : '',
          apgar10Min: infant.apgar10Min !== null ? String(infant.apgar10Min) : '',
        }))
      : [blankInfant()],
  )

  const choosePlurality = (value: Plurality | null) => {
    setPlurality(value)
    const count = value ? PLURALITY_COUNT[value] : 1
    setInfants((current) =>
      current.length >= count
        ? current.slice(0, Math.max(count, 1))
        : [...current, ...Array.from({ length: count - current.length }, () => blankInfant(eventDate))],
    )
  }

  const isLscs = deliveryMode === 'LSCS_ELECTIVE' || deliveryMode === 'LSCS_EMERGENCY'

  const chooseDeliveryMode = (value: DeliveryMode) => {
    setDeliveryMode(value)
    // A caesarean leaves a scar; ticked for the doctor to confirm, never hidden.
    if (value === 'LSCS_ELECTIVE' || value === 'LSCS_EMERGENCY') setHasScar(true)
  }

  const updateInfant = (index: number, patch: Partial<InfantDraft>) =>
    setInfants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const save = () => {
    setError(null)
    const kg = (value: string) => {
      const n = toNumberOrNull(value)
      return n === null ? null : Math.round(n * 1000)
    }

    const payload = {
      eventDate: eventDate || null,
      yearOfEvent: eventDate ? null : toIntOrNull(yearOfEvent),
      outcome,
      deliveryMode,
      gestationWeeksAtDelivery: toIntOrNull(gestationWeeks),
      gestationCategory: gestation,
      conceptionMode: conception,
      conceptionRemarks: conceptionRemarks || null,
      babyPosition: babyPosition || null,
      inducedComplications: induced,
      inducedComplicationsRemarks: inducedRemarks || null,
      relatedComplications: related,
      relatedComplicationsRemarks: relatedRemarks || null,
      plurality,
      pluralityOther: plurality === 'OTHER' ? pluralityOther || null : null,
      hasUterineScar: hasScar,
      scarIndication: hasScar || isLscs ? scarIndication.trim() || null : null,
      placeOfEvent: place || null,
      remarks: remarks || null,
      infants: infants
        .map((infant, index) => ({
          fetusNo: index + 1,
          outcome: infant.outcome,
          outcomeRemarks: infant.outcomeRemarks || null,
          deliveredOn: infant.deliveredOn || null,
          deliveredTime: infant.deliveredTime || null,
          birthWeightGrams: kg(infant.birthWeightKg),
          sex: infant.sex,
          apgar1Min: toIntOrNull(infant.apgar1Min),
          apgar5Min: toIntOrNull(infant.apgar5Min),
          apgar10Min: toIntOrNull(infant.apgar10Min),
        }))
        // A baby block with nothing in it is not a baby on the record.
        .filter((infant) =>
          Object.entries(infant).some(([key, value]) => key !== 'fetusNo' && value !== null),
        ),
      source: 'PATIENT_REPORTED' as const,
    }

    startTransition(async () => {
      const result = await saveObstetricHistoryAction({
        patientId,
        historyId: entry?.id ?? null,
        expectedVersion: entry?.version ?? null,
        entry: payload,
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
      title={`Gravida ${gravida} — past obstetric history`}
      subtitle={entry ? 'Correcting a recorded pregnancy. The previous version is kept in the audit trail.' : 'Recording a previous pregnancy.'}
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
            {pending ? 'Saving…' : 'Save pregnancy'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Section title="Conception">
          <div className="flex flex-wrap items-center gap-3">
            <RadioRow name="Conception" options={entries(CONCEPTION_LABELS)} value={conception} onChange={setConception} />
            <input
              value={conceptionRemarks}
              onChange={(e) => setConceptionRemarks(e.target.value)}
              placeholder="Remarks"
              className={`${FIELD} max-w-xs`}
            />
          </div>
        </Section>

        <Section title="Delivery">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date of delivery">
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
            {!eventDate ? (
              <Field label="…or year only">
                <input
                  type="number"
                  min={1950}
                  max={2100}
                  value={yearOfEvent}
                  onChange={(e) => setYearOfEvent(e.target.value)}
                  placeholder="e.g. 2022"
                  className={`${FIELD} numeric`}
                />
              </Field>
            ) : null}
            <Field label="Type of delivery">
              <select value={deliveryMode} onChange={(e) => chooseDeliveryMode(e.target.value as DeliveryMode)} className={FIELD}>
                {entries(DELIVERY_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value === 'UNKNOWN' ? 'Type of delivery…' : label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Baby's position">
              <select value={babyPosition} onChange={(e) => setBabyPosition(e.target.value)} className={FIELD}>
                <option value="">Baby&rsquo;s position…</option>
                {[...new Set([...BABY_POSITIONS, babyPosition].filter(Boolean))].map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pregnancy outcome">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as PriorOutcome)} className={FIELD}>
                {entries(PRIOR_OUTCOME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value === 'UNKNOWN' ? 'Outcome…' : label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Place of delivery">
              <input value={place} onChange={(e) => setPlace(e.target.value)} className={FIELD} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={hasScar} onChange={(e) => setHasScar(e.target.checked)} className="h-3.5 w-3.5 accent-brand-600" />
              Uterine scar
            </label>
            {hasScar && !isLscs ? (
              <input
                value={scarIndication}
                onChange={(e) => setScarIndication(e.target.value)}
                placeholder="Indication for LSCS / surgery"
                className={`${FIELD} max-w-sm`}
              />
            ) : null}
          </div>
          {isLscs ? (
            <DictatedTextarea
              id="lscs-reason"
              label={`Reason for LSCS (${deliveryMode === 'LSCS_EMERGENCY' ? 'emergency' : 'elective'})`}
              rows={2}
              value={scarIndication}
              onValueChange={setScarIndication}
              options={['Fetal distress', 'Non-progress of labour', 'CPD', 'Breech presentation', 'Previous LSCS', 'Failed induction', 'Placenta previa']}
              placeholder="Type, or press Voice and speak — e.g. fetal distress"
            />
          ) : null}
        </Section>

        <Section title="Gestational age at delivery">
          <div className="flex flex-wrap items-center gap-3">
            <RadioRow name="Gestational age at delivery" options={entries(GESTATION_LABELS)} value={gestation} onChange={setGestation} />
            <span className="flex items-center gap-1 text-[11px] text-slate-600">
              <input
                type="number"
                min={16}
                max={45}
                value={gestationWeeks}
                onChange={(e) => setGestationWeeks(e.target.value)}
                className={`${FIELD} numeric w-20`}
                aria-label="Weeks at delivery"
              />
              weeks
            </span>
          </div>
        </Section>

        <Section title="Pregnancy induced complication">
          <MultiWithNone name="Pregnancy induced complication" options={entries(INDUCED_COMPLICATION_LABELS)} value={induced} onChange={setInduced} />
          <input value={inducedRemarks} onChange={(e) => setInducedRemarks(e.target.value)} placeholder="Remarks" className={FIELD} />
        </Section>

        <Section title="Pregnancy related complication">
          <MultiWithNone name="Pregnancy related complication" options={entries(RELATED_COMPLICATION_LABELS)} value={related} onChange={setRelated} />
          <input value={relatedRemarks} onChange={(e) => setRelatedRemarks(e.target.value)} placeholder="Remarks" className={FIELD} />
        </Section>

        <Section title="Number of children born">
          <div className="flex flex-wrap items-center gap-3">
            <RadioRow name="Number of children born" options={entries(PLURALITY_LABELS)} value={plurality} onChange={choosePlurality} />
            {plurality === 'OTHER' ? (
              <input value={pluralityOther} onChange={(e) => setPluralityOther(e.target.value)} placeholder="Describe" className={`${FIELD} max-w-40`} />
            ) : null}
          </div>
        </Section>

        {infants.map((infant, index) => (
          <Section
            key={index}
            title={`Fetus ${index + 1}`}
            aside={
              plurality === 'OTHER' && infants.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setInfants((rows) => rows.filter((_, i) => i !== index))}
                  className="text-[11px] text-slate-500 hover:text-alert-700"
                >
                  Remove
                </button>
              ) : null
            }
          >
            <span className="text-[11px] font-medium text-slate-600">Delivery outcome</span>
            <div className="flex flex-wrap items-center gap-3">
              <RadioRow
                name={`Fetus ${index + 1} outcome`}
                options={entries(INFANT_OUTCOME_LABELS)}
                value={infant.outcome}
                onChange={(outcome) => updateInfant(index, { outcome })}
              />
              <input
                value={infant.outcomeRemarks}
                onChange={(e) => updateInfant(index, { outcomeRemarks: e.target.value })}
                placeholder="Remarks"
                className={`${FIELD} max-w-xs`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4 lg:grid-cols-7">
              <Field label="Delivery date" className="col-span-1 lg:col-span-1">
                <input type="date" value={infant.deliveredOn} onChange={(e) => updateInfant(index, { deliveredOn: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
              <Field label="Time">
                <input type="time" value={infant.deliveredTime} onChange={(e) => updateInfant(index, { deliveredTime: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
              <Field label="Birth weight (kg)">
                <input type="number" step="0.01" min={0.2} max={7} value={infant.birthWeightKg} onChange={(e) => updateInfant(index, { birthWeightKg: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
              <Field label="Gender">
                <select
                  value={infant.sex ?? ''}
                  onChange={(e) => updateInfant(index, { sex: (e.target.value || null) as InfantSex | null })}
                  className={FIELD}
                >
                  <option value="">Gender…</option>
                  {entries(INFANT_SEX_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="APGAR 1 min">
                <input type="number" min={0} max={10} value={infant.apgar1Min} onChange={(e) => updateInfant(index, { apgar1Min: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
              <Field label="5 min">
                <input type="number" min={0} max={10} value={infant.apgar5Min} onChange={(e) => updateInfant(index, { apgar5Min: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
              <Field label="10 min">
                <input type="number" min={0} max={10} value={infant.apgar10Min} onChange={(e) => updateInfant(index, { apgar10Min: e.target.value })} className={`${FIELD} numeric`} />
              </Field>
            </div>
          </Section>
        ))}
        {plurality === 'OTHER' ? (
          <button
            type="button"
            onClick={() => setInfants((rows) => [...rows, blankInfant(eventDate)])}
            className="self-start text-[11px] font-semibold text-brand-700 hover:underline"
          >
            + Add another baby
          </button>
        ) : null}

        <Section title="Remarks">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className={FIELD} />
        </Section>
      </div>
    </Modal>
  )
}
