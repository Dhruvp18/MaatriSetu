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
 *   clinician's call (PRD §3).
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
    <header className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      {/* Row 1 — identity */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-slate-900">{patient.fullName}</h1>
        <span className="numeric text-sm text-slate-500">
          {patient.uhid}
          {age !== null ? ` · ${age} y` : ''}
        </span>
        <span className="numeric rounded border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
          {formatGpla(pregnancy)}
        </span>
      </div>

      {/* Row 2 — where this pregnancy is, and today's numbers */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {dating.status === 'ESTABLISHED' ? (
          <>
            <Field label="POG">
              {formatGestationalAge(gestationalAge(dating.reference, today))}
            </Field>
            <Field label="EDD">{estimatedDueDate(dating.reference)}</Field>
            {pregnancy.reportedLmp.date ? (
              <Field label="LMP">{pregnancy.reportedLmp.date}</Field>
            ) : null}
          </>
        ) : (
          <span className="rounded border border-caution-700/30 bg-caution-50 px-2 py-0.5 text-xs font-medium text-caution-700">
            Dating not established
          </span>
        )}

        {latestVitals?.bloodPressure ? (
          <Field label="BP">
            {latestVitals.bloodPressure.systolicMmHg}/{latestVitals.bloodPressure.diastolicMmHg}{' '}
            <Unit>mmHg</Unit>
          </Field>
        ) : null}

        {latestVitals?.pulseBpm !== null && latestVitals?.pulseBpm !== undefined ? (
          <Field label="Pulse">
            {latestVitals.pulseBpm} <Unit>bpm</Unit>
          </Field>
        ) : null}

        {latestVitals?.weightKg !== null && latestVitals?.weightKg !== undefined ? (
          <Field label="Weight">
            {latestVitals.weightKg} <Unit>kg</Unit>
            {/* Arithmetic against her own recorded baseline, nothing more. No
                judgment about whether the gain is appropriate. */}
            {weightGain !== null ? (
              <span className="ml-1 text-slate-500">
                ({weightGain >= 0 ? '+' : ''}
                {weightGain.toFixed(1)} from booking)
              </span>
            ) : null}
          </Field>
        ) : null}
      </div>

      {/* Row 3 — what must not be missed */}
      <div className="mt-3 flex flex-wrap gap-2">
        {patient.bloodGroup && isRhNegative(patient.bloodGroup.value) ? (
          <Pill tone="alert">Rh negative · {formatBloodGroup(patient.bloodGroup.value)}</Pill>
        ) : null}

        {patient.allergies.status === 'KNOWN' ? (
          <Pill tone="alert">Allergy · {describeAllergies(patient.allergies)}</Pill>
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
    </header>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs tracking-wide text-slate-500 uppercase">{label}</span>
      <span className="numeric font-medium text-slate-800">{children}</span>
    </span>
  )
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-normal text-slate-500">{children}</span>
}

function Pill({ tone, children }: { tone: 'alert' | 'caution'; children: React.ReactNode }) {
  const styles =
    tone === 'alert'
      ? 'border-alert-600/30 bg-alert-50 text-alert-700'
      : 'border-caution-700/30 bg-caution-50 text-caution-700'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      {children}
    </span>
  )
}
