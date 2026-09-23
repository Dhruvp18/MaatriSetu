import { AlertTriangle, CalendarDays, ShieldAlert } from 'lucide-react'

import type { CalendarDate } from '@core/obstetrics/dating'
import {
  estimatedDueDate,
  formatGestationalAge,
  gestationalAge,
} from '@core/obstetrics/dating'
import {
  ageInYears,
  describeAllergies,
  formatBloodGroup,
  isRhNegative,
  type Patient,
} from '@modules/patients/patient.types'
import type { ObstetricHistoryEntry, Pregnancy } from '@modules/pregnancies/pregnancy.types'
import type { VitalsReading } from '@modules/visits/visit.types'

/**
 * The always-visible patient banner (PRD F3).
 *
 * Three rows, in the order a clinician absorbs them: who she is, where this
 * pregnancy is, and what must not be missed.
 *
 * Two deliberate omissions:
 *
 *   Fetal presentation is NOT here, though it is on the scan. Presentation
 *   before term changes, and a stale "breech" pinned to the top of every screen
 *   for six weeks invites a decision based on a number nobody re-checked. It
 *   lives with the scan that observed it, dated.
 *
 *   Nothing on this banner is computed from a clinical rule. The red pill means
 *   "her blood group is Rh negative", a transcribed fact — not "Anti-D is due",
 *   which depends on gestation, sensitising events and titres and is the
 *   clinician's call (PRD §3). The Stitch reference prints "(Anti-D Due)" on
 *   that pill and marks the vitals "Norm"; both are omitted here for the same
 *   reason — this product does not decide either of those things.
 *
 * Laid out as the reference's hero card: an icon tile, the identity line with
 * its obstetric and gestation badges, a monospaced record line, the flags
 * pushed right, and a six-tile vitals ribbon under a hairline.
 */

export function HeaderBanner({
  patient,
  pregnancy,
  obstetricHistory,
  latestVitals,
  today,
}: {
  patient: Patient
  pregnancy: Pregnancy
  obstetricHistory: readonly ObstetricHistoryEntry[]
  latestVitals: VitalsReading | null
  today: CalendarDate
}) {
  const age = ageInYears(patient.age, today)
  const { dating } = pregnancy

  const weightGain = weightGainKg(pregnancy, latestVitals)
  const previousScar = obstetricHistory.some((entry) => entry.hasUterineScar)

  return (
    <header className="glass relative overflow-hidden rounded-xl border border-slate-200/90 p-4 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Identity */}
        <div className="flex items-start gap-3 sm:items-center">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-lg font-bold text-brand-800 shadow-xs"
          >
            {patient.fullName.trim().charAt(0).toUpperCase() || '—'}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {patient.fullName}
              </h1>

              {age !== null ? (
                <span className="numeric rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {age}Y / F
                </span>
              ) : null}

              <span className="numeric rounded-full bg-brand-800 px-2.5 py-0.5 text-xs font-bold tracking-wider text-white shadow-xs">
                {formatGpla(pregnancy)}
              </span>

              {dating.status === 'ESTABLISHED' ? (
                <span className="font-heading flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                  <CalendarDays aria-hidden className="h-3.25 w-3.25" />
                  <span className="numeric">
                    POG: {formatGestationalAge(gestationalAge(dating.reference, today))}
                  </span>
                </span>
              ) : (
                <span className="rounded-full border border-caution-200 bg-caution-50 px-2.5 py-0.5 text-xs font-semibold text-caution-700">
                  Dating not established
                </span>
              )}
            </div>

            {/* The record line: what a clerk reads off the file, in mono. */}
            <div className="numeric mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>
                UHID: <strong className="font-semibold text-slate-800">{patient.uhid}</strong>
              </span>
              {pregnancy.reportedLmp.date ? (
                <>
                  <span aria-hidden className="text-slate-400">
                    •
                  </span>
                  <span>LMP: {pregnancy.reportedLmp.date}</span>
                </>
              ) : null}
              {dating.status === 'ESTABLISHED' ? (
                <>
                  <span aria-hidden className="text-slate-400">
                    •
                  </span>
                  <span>EDD: {estimatedDueDate(dating.reference)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* What must not be missed */}
        <div className="flex flex-wrap items-center gap-2">
          {patient.bloodGroup && isRhNegative(patient.bloodGroup.value) ? (
            // Solid red, the one pill on the screen that is allowed to shout.
            // It states a transcribed blood group and nothing more.
            <span className="flex items-center gap-1.5 rounded-full bg-alert-600 px-3 py-1 text-xs font-semibold text-white shadow-xs">
              <AlertTriangle aria-hidden className="h-3.75 w-3.75" />
              {/* The group already carries its sign ("O−"), so the Rh status
                  leads and the group follows rather than saying it twice. */}
              <span className="tracking-tight">
                <span className="uppercase">Rh-negative</span> ·{' '}
                {formatBloodGroup(patient.bloodGroup.value)}
              </span>
            </span>
          ) : null}

          {patient.allergies.status === 'KNOWN' ? (
            <Pill tone="alert" icon={<ShieldAlert aria-hidden className="h-3.75 w-3.75" />}>
              Allergy · {describeAllergies(patient.allergies)}
            </Pill>
          ) : null}

          {/* "Not asked" is shown, not hidden. A blank allergy line on a screen a
              clinician prescribes from reads as reassurance. */}
          {patient.allergies.status === 'UNKNOWN' ? (
            <Pill tone="caution">Allergies not recorded</Pill>
          ) : null}

          {previousScar ? <Pill tone="caution">Previous uterine scar</Pill> : null}

          {patient.bloodGroup === null ? (
            <Pill tone="caution">Blood group not recorded</Pill>
          ) : null}
        </div>
      </div>

      {/* Today's numbers, as a dense ribbon under a hairline. */}
      {latestVitals ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-4 lg:grid-cols-6">
          <Tile label="BP">
            {latestVitals.bloodPressure ? (
              <>
                {latestVitals.bloodPressure.systolicMmHg}/
                {latestVitals.bloodPressure.diastolicMmHg} <Unit>mmHg</Unit>
              </>
            ) : null}
          </Tile>

          <Tile label="Pulse">
            {latestVitals.pulseBpm !== null ? (
              <>
                {latestVitals.pulseBpm} <Unit>bpm</Unit>
              </>
            ) : null}
          </Tile>

          <Tile label="Weight">
            {latestVitals.weightKg !== null ? (
              <>
                {latestVitals.weightKg} <Unit>kg</Unit>
                {/* Arithmetic against her own recorded baseline, nothing more.
                    No judgment about whether the gain is appropriate. */}
                {weightGain !== null ? (
                  <Unit>
                    {' '}
                    ({weightGain >= 0 ? '+' : ''}
                    {weightGain.toFixed(1)})
                  </Unit>
                ) : null}
              </>
            ) : null}
          </Tile>

          <Tile label="FHR" accent>
            {latestVitals.fetalHeartRateBpm !== null ? (
              <>
                {latestVitals.fetalHeartRateBpm} <Unit>bpm</Unit>
              </>
            ) : null}
          </Tile>

          <Tile label="Fundal ht">
            {latestVitals.fundalHeightCm !== null ? (
              <>
                {latestVitals.fundalHeightCm} <Unit>cm</Unit>
              </>
            ) : null}
          </Tile>

          <Tile label="Urine alb.">
            {latestVitals.urineAlbumin !== null ? latestVitals.urineAlbumin.toLowerCase() : null}
          </Tile>
        </div>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          No vitals recorded at this visit yet.
        </p>
      )}
    </header>
  )
}

/**
 * One cell of the vitals ribbon.
 *
 * A reading that was never taken prints as an em-dash rather than vanishing.
 * A six-tile grid that silently becomes four is how a clinician comes away
 * believing a blood pressure was recorded.
 */
function Tile({
  label,
  accent = false,
  children,
}: {
  label: string
  accent?: boolean
  children: React.ReactNode
}) {
  const recorded = children !== null && children !== undefined && children !== false

  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-200/60 bg-slate-50/80 px-2.5 py-1.5">
      <span className="shrink-0 text-slate-500">{label}</span>
      {recorded ? (
        <span
          className={`numeric truncate font-bold ${accent ? 'text-brand-800' : 'text-slate-800'}`}
        >
          {children}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      )}
    </div>
  )
}

/**
 * Weight gained since booking, or null.
 *
 * Null when either end is missing — showing a gain computed from a baseline
 * nobody recorded would be a fabricated number on a screen that looks precise.
 */
function weightGainKg(pregnancy: Pregnancy, vitals: VitalsReading | null): number | null {
  if (vitals?.weightKg == null || pregnancy.prePregnancyWeightKg == null) return null
  return vitals.weightKg - pregnancy.prePregnancyWeightKg
}

/** `G2 P1 L1 A0`, with a dash wherever a count was never asked. */
function formatGpla(pregnancy: Pregnancy): string {
  const { gravida, parity, living, abortions } = pregnancy.gravidaParity
  const part = (label: string, value: number | null) => `${label}${value ?? '–'}`
  return [
    part('G', gravida),
    part('P', parity),
    part('L', living),
    part('A', abortions),
  ].join(' ')
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-normal text-slate-500">{children}</span>
}

function Pill({
  tone,
  icon,
  children,
}: {
  tone: 'alert' | 'caution'
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const styles =
    tone === 'alert'
      ? 'border-alert-200 bg-alert-50 text-alert-700'
      : 'border-caution-200 bg-caution-50 text-caution-900'

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      {icon ? (
        <span aria-hidden className={tone === 'alert' ? 'text-alert-600' : 'text-caution-600'}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
