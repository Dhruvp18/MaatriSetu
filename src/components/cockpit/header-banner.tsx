import { AlertTriangle, CalendarDays, ShieldAlert } from 'lucide-react'

import type { CalendarDate } from '@core/obstetrics/dating'
import {
  TERM_DAYS,
  addDays,
  formatGestationalAge,
  gestationalAge,
} from '@core/obstetrics/dating'
import {
  type BloodGroup,
  ageInYears,
  describeAllergies,
  formatBloodGroup,
  isRhNegative,
  type Patient,
} from '@modules/patients/patient.types'
import { type ObstetricHistoryEntry, type Pregnancy, SHORT_STATURE_CM } from '@modules/pregnancies/pregnancy.types'
import type { VitalsReading } from '@modules/visits/visit.types'

/**
 * The always-visible patient banner (PRD F3).
 *
 * Left: her blood group, colour-coded, then who she is — name, age, record
 * line, height, weight, pulse, BP and SFH (BP and SFH graph on hover). Right:
 * where this pregnancy is (GPLA, POG) and what must not be missed. The full set
 * of today's vitals is in the Examination section (vitals-panel.tsx).
 *
 * ---------------------------------------------------------------------------
 * Blood group colours
 * ---------------------------------------------------------------------------
 * The ABO label colours used on blood bags and cross-match forms: O blue, A
 * yellow, B pink, AB white. A clinician recognises the group from the colour
 * before reading the letters, which is the point of the convention. The colour
 * encodes a transcribed fact, not a clinical judgment. Rh-negative is repeated
 * as its own red pill on the right, because it is the part of the group that
 * changes management and must not depend on colour vision.
 *
 * Two deliberate omissions, unchanged from before:
 *
 *   Fetal presentation is NOT here. It changes before term, and a stale
 *   "breech" pinned to every screen invites a decision on an old number. It
 *   lives with the scan that observed it, dated.
 *
 *   Nothing here is computed from a clinical rule. The red pill states an Rh
 *   group; it never says "Anti-D due" (PRD §3). The weight shows what she gained
 *   against her own baseline, never whether that gain is appropriate.
 */

const ABO_STYLES: Record<'O' | 'A' | 'B' | 'AB', { tile: string; label: string }> = {
  O: { tile: 'border-sky-300 bg-sky-500 text-white', label: 'text-sky-50' },
  A: { tile: 'border-yellow-400 bg-yellow-300 text-yellow-950', label: 'text-yellow-900' },
  B: { tile: 'border-pink-300 bg-pink-500 text-white', label: 'text-pink-50' },
  AB: { tile: 'border-slate-300 bg-white text-slate-900', label: 'text-slate-500' },
}

function aboOf(group: BloodGroup): 'O' | 'A' | 'B' | 'AB' {
  return group.split('_')[0] as 'O' | 'A' | 'B' | 'AB'
}

/**
 * Pulse, BP and SFH for the banner: the latest reading of each this pregnancy,
 * dated, and the BP and SFH series behind the hover graphs. Oldest first.
 */
export interface BannerVitals {
  readonly pulse: { readonly bpm: number; readonly on: CalendarDate } | null
  readonly bp: { readonly systolic: number; readonly diastolic: number; readonly on: CalendarDate } | null
  readonly sfh: { readonly cm: number; readonly on: CalendarDate } | null
  readonly bpTrend: readonly { readonly on: CalendarDate; readonly systolic: number; readonly diastolic: number }[]
  readonly sfhTrend: readonly { readonly on: CalendarDate; readonly value: number }[]
}

export function HeaderBanner({
  patient,
  pregnancy,
  obstetricHistory,
  latestVitals,
  baselineWeightKg,
  today,
  husbandBloodGroup = null,
  flaggedDiagnoses = null,
  eddByScan = null,
  vitals = null,
}: {
  patient: Patient
  pregnancy: Pregnancy
  obstetricHistory: readonly ObstetricHistoryEntry[]
  latestVitals: VitalsReading | null
  /** Pre-pregnancy weight, or the first weight recorded this pregnancy. */
  baselineWeightKg: number | null
  today: CalendarDate
  /**
   * The husband's blood group as printed on a verified report, or null when
   * none is on file. Shown only beside an Rh-negative mother's pill.
   */
  husbandBloodGroup?: string | null
  /** The diagnoses a clinician flagged, rendered by the caller (they are interactive). */
  flaggedDiagnoses?: React.ReactNode
  /**
   * EDD from ultrasound, worked out by the caller from the scan that dates the
   * pregnancy, with that scan's date. Null when no scan printed a gestational age.
   */
  eddByScan?: { readonly date: CalendarDate; readonly scanDate: CalendarDate } | null
  /** Pulse, BP and SFH, worked out by the caller from this pregnancy's readings. */
  vitals?: BannerVitals | null
}) {
  const age = ageInYears(patient.age, today)
  const { dating } = pregnancy
  const previousScar = obstetricHistory.some((entry) => entry.hasUterineScar)
  const weight = formatWeight(baselineWeightKg, latestVitals?.weightKg ?? null)

  return (
    // Not overflow-hidden: the BP and SFH hover graphs drop below the banner.
    <header className="glass relative z-10 rounded-xl border border-slate-200/90 p-4 shadow-xs">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: blood group, then identity */}
        <div className="flex items-stretch gap-3">
          <BloodGroupTile group={patient.bloodGroup?.value ?? null} />

          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {patient.fullName}
              </h1>
              {age !== null ? (
                <span className="numeric rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {age}Y / F
                </span>
              ) : null}
            </div>

            <div className="numeric mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span>
                UHID: <strong className="font-semibold text-slate-800">{patient.uhid}</strong>
              </span>
              <Dot />
              {/* Shown as stated. Nothing here checks it with ABDM, so an
                  unverified number says so rather than passing for a verified one. */}
              {patient.abhaId ? (
                <span>
                  ABHA: <strong className="font-semibold text-slate-800">{formatAbha(patient.abhaId)}</strong>
                  <span className="text-slate-400">
                    {' '}
                    ({patient.abhaVerification === 'VERIFIED' ? 'verified' : 'not verified'})
                  </span>
                </span>
              ) : (
                <span className="text-slate-400">ABHA: not recorded</span>
              )}
              {pregnancy.reportedLmp.date ? (
                <>
                  <Dot />
                  <span>LMP: {pregnancy.reportedLmp.date}</span>
                </>
              ) : null}
              {/* Both EDDs, side by side, each labelled with where it comes from.
                  Which one to go by is the doctor's decision. */}
              <Dot />
              <span>
                EDD by date:{' '}
                {pregnancy.reportedLmp.date ? (
                  <strong className="font-semibold text-slate-800">{addDays(pregnancy.reportedLmp.date, TERM_DAYS)}</strong>
                ) : (
                  <span className="text-slate-400">no LMP</span>
                )}
              </span>
              <Dot />
              <span>
                EDD by scan:{' '}
                {eddByScan ? (
                  <>
                    <strong className="font-semibold text-slate-800">{eddByScan.date}</strong>
                    <span className="text-slate-400"> (scan {eddByScan.scanDate})</span>
                  </>
                ) : (
                  <span className="text-slate-400">no dating scan</span>
                )}
              </span>
              {pregnancy.heightCm !== null ? (
                <>
                  <Dot />
                  {/* Below 150 cm in red, as the OPD asked: the measurement, stated, not a conclusion. */}
                  <span className={pregnancy.heightCm < SHORT_STATURE_CM ? 'font-bold text-alert-700' : undefined}>
                    Ht:{' '}
                    <strong className={pregnancy.heightCm < SHORT_STATURE_CM ? 'font-bold' : 'font-semibold text-slate-800'}>
                      {Number.isInteger(pregnancy.heightCm) ? pregnancy.heightCm : pregnancy.heightCm.toFixed(1)} cm
                    </strong>
                    {pregnancy.heightCm < SHORT_STATURE_CM ? <span> (&lt; {SHORT_STATURE_CM})</span> : null}
                  </span>
                </>
              ) : null}
              {weight ? (
                <>
                  <Dot />
                  <span>
                    Wt: <strong className="font-semibold text-slate-800">{weight.text}</strong>
                    {weight.note ? <span className="text-slate-400"> ({weight.note})</span> : null}
                  </span>
                </>
              ) : null}
              <Dot />
              <span>
                Pulse:{' '}
                {vitals?.pulse ? (
                  <>
                    <strong className="font-semibold text-slate-800">{vitals.pulse.bpm} bpm</strong>
                    <AsOf on={vitals.pulse.on} today={today} />
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </span>
              <Dot />
              <HoverTrend
                label="BP"
                trend={
                  vitals && vitals.bpTrend.length > 0 ? (
                    <MiniTrend
                      title="Blood pressure (mmHg)"
                      series={[
                        vitals.bpTrend.map((p) => ({ on: p.on, value: p.systolic })),
                        vitals.bpTrend.map((p) => ({ on: p.on, value: p.diastolic })),
                      ]}
                    />
                  ) : null
                }
              >
                {vitals?.bp ? (
                  <>
                    <strong className="font-semibold text-slate-800">
                      {vitals.bp.systolic}/{vitals.bp.diastolic} mmHg
                    </strong>
                    <AsOf on={vitals.bp.on} today={today} />
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </HoverTrend>
              <Dot />
              <HoverTrend
                label="SFH"
                trend={
                  vitals && vitals.sfhTrend.length > 0 ? (
                    <MiniTrend title="Symphysis–fundal height (cm)" series={[vitals.sfhTrend]} />
                  ) : null
                }
              >
                {vitals?.sfh ? (
                  <>
                    <strong className="font-semibold text-slate-800">{vitals.sfh.cm} cm</strong>
                    <AsOf on={vitals.sfh.on} today={today} />
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </HoverTrend>
            </div>
          </div>
        </div>

        {/* Right: pregnancy, then what must not be missed */}
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <span className="numeric rounded-full bg-brand-800 px-3 py-1 text-xs font-bold tracking-wider text-white shadow-xs">
              {formatGpla(pregnancy)}
            </span>
            {dating.status === 'ESTABLISHED' ? (
              <span className="font-heading flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                <CalendarDays aria-hidden className="h-3.25 w-3.25" />
                <span className="numeric">
                  POG: {formatGestationalAge(gestationalAge(dating.reference, today))}
                </span>
              </span>
            ) : (
              <span className="rounded-full border border-caution-200 bg-caution-50 px-3 py-1 text-xs font-semibold text-caution-700">
                Dating not established
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {patient.bloodGroup && isRhNegative(patient.bloodGroup.value) ? (
              <span className="flex items-center gap-1.5 rounded-full bg-alert-600 px-3 py-1 text-xs font-semibold text-white shadow-xs">
                <AlertTriangle aria-hidden className="h-3.75 w-3.75" />
                <span className="tracking-tight">
                  <span className="uppercase">Rh-negative</span> · {formatBloodGroup(patient.bloodGroup.value)}
                </span>
                <span className="ml-0.5 border-l border-white/40 pl-1.5 font-normal">
                  Husband: <strong className="font-bold">{husbandBloodGroup ?? 'not on file'}</strong>
                </span>
              </span>
            ) : null}
            {patient.allergies.status === 'KNOWN' ? (
              <Pill tone="alert" icon={<ShieldAlert aria-hidden className="h-3.75 w-3.75" />}>
                Allergy · {describeAllergies(patient.allergies)}
              </Pill>
            ) : null}
            {/* "Not asked" is shown, not hidden: a blank allergy line on a
                screen a clinician prescribes from reads as reassurance. */}
            {patient.allergies.status === 'UNKNOWN' ? <Pill tone="caution">Allergies not recorded</Pill> : null}
            {previousScar ? <Pill tone="caution">Previous uterine scar</Pill> : null}
          </div>
          {flaggedDiagnoses}
        </div>
      </div>
    </header>
  )
}

function BloodGroupTile({ group }: { group: BloodGroup | null }) {
  if (group === null) {
    return (
      <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-caution-300 bg-caution-50 px-1 py-1.5 text-center">
        <span className="text-[9px] font-bold tracking-wider text-caution-700 uppercase">Blood grp</span>
        <span className="text-[10px] leading-tight font-semibold text-caution-900">not recorded</span>
      </span>
    )
  }

  const style = ABO_STYLES[aboOf(group)]
  return (
    <span
      className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 px-1 py-1.5 shadow-xs ${style.tile}`}
      title={`Blood group ${formatBloodGroup(group)}`}
    >
      <span className={`text-[9px] font-bold tracking-wider uppercase ${style.label}`}>Blood grp</span>
      <span className="font-heading numeric text-xl leading-none font-extrabold">{formatBloodGroup(group)}</span>
    </span>
  )
}

/**
 * Weight as today's figure, then her baseline plus the change: `63 kg (55 + 8)`.
 *
 * Arithmetic on her own recorded numbers. With no baseline the current weight
 * stands alone; with no weight today the baseline is shown and labelled, so an
 * old number never passes for today's.
 */
export function formatWeight(
  baselineKg: number | null,
  currentKg: number | null,
): { text: string; note: string | null } | null {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

  if (currentKg === null) {
    return baselineKg === null ? null : { text: `${fmt(baselineKg)} kg`, note: 'initial' }
  }
  if (baselineKg === null) return { text: `${fmt(currentKg)} kg`, note: null }

  const change = Math.round((currentKg - baselineKg) * 10) / 10
  return {
    text: `${fmt(currentKg)} kg`,
    note: `${fmt(baselineKg)} ${change < 0 ? '−' : '+'} ${fmt(Math.abs(change))}`,
  }
}

/** A 14-digit ABHA number as it is printed on the card: `12-3456-7890-1234`. Anything else is shown as stored. */
function formatAbha(abhaId: string): string {
  const digits = abhaId.replace(/\D/g, '')
  return digits.length === 14
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`
    : abhaId
}

/** A reading not taken today carries its date, so an old number never passes for today's. */
function AsOf({ on, today }: { on: CalendarDate; today: CalendarDate }) {
  return on === today ? null : <span className="text-slate-400"> ({on})</span>
}

/**
 * A banner value with its trend on hover (and on keyboard focus). Pure CSS —
 * the banner stays a server component.
 */
function HoverTrend({ label, trend, children }: { label: string; trend: React.ReactNode; children: React.ReactNode }) {
  if (!trend) {
    return (
      <span>
        {label}: {children}
      </span>
    )
  }
  return (
    <span tabIndex={0} className="group relative cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
      <span className="underline decoration-slate-300 decoration-dotted underline-offset-2">
        {label}: {children}
      </span>
      <span className="pointer-events-none absolute top-full left-0 z-30 mt-1.5 hidden rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg group-hover:block group-focus:block">
        {trend}
      </span>
    </span>
  )
}

const MINI_W = 220
const MINI_H = 96
const MINI_PAD_X = 14
const MINI_PAD_TOP = 16
const MINI_PAD_BOTTOM = 28

/**
 * A small line chart of one or two series sharing an axis (BP draws systolic
 * over diastolic). One neutral colour, nothing coloured by high or low — the
 * banner states readings, it does not grade them (PRD §3).
 */
function MiniTrend({
  title,
  series,
}: {
  title: string
  series: readonly (readonly { readonly on: CalendarDate; readonly value: number }[])[]
}) {
  const all = series.flat()
  const days = [...new Set(all.map((p) => p.on))].sort()
  const min = Math.min(...all.map((p) => p.value))
  const max = Math.max(...all.map((p) => p.value))
  const span = max - min || 1
  const x = (on: CalendarDate) =>
    days.length === 1
      ? MINI_W / 2
      : MINI_PAD_X + (days.indexOf(on) / (days.length - 1)) * (MINI_W - MINI_PAD_X * 2)
  const y = (value: number) =>
    MINI_PAD_TOP + (1 - (value - min) / span) * (MINI_H - MINI_PAD_TOP - MINI_PAD_BOTTOM)
  const short = (on: CalendarDate) => {
    const d = new Date(`${on}T00:00:00`)
    return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`
  }

  return (
    <span className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-wider whitespace-nowrap text-slate-600 uppercase">
        {title}
      </span>
      <svg width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`} aria-hidden focusable="false">
        {series.map((points, s) => (
          <g key={s}>
            <polyline
              points={points.map((p) => `${x(p.on).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
              fill="none"
              stroke="#c43f55"
              strokeOpacity={s === 0 ? 1 : 0.55}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={x(p.on)} cy={y(p.value)} r="2.75" fill="#fff" stroke="#c43f55" strokeWidth="1.5" />
                <text
                  x={x(p.on)}
                  y={s === 0 ? y(p.value) - 6 : y(p.value) + 12}
                  fontSize="9"
                  fontWeight="600"
                  fill="#7f1d2d"
                  textAnchor="middle"
                >
                  {Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}
                </text>
              </g>
            ))}
          </g>
        ))}
        <text x={MINI_PAD_X} y={MINI_H - 3} fontSize="9" fill="#64748b">
          {short(days[0]!)}
        </text>
        {days.length > 1 ? (
          <text x={MINI_W - MINI_PAD_X} y={MINI_H - 3} fontSize="9" fill="#64748b" textAnchor="end">
            {short(days[days.length - 1]!)}
          </text>
        ) : null}
      </svg>
    </span>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-slate-400">
      •
    </span>
  )
}

/** `G2 P1 L1 A0`, with a dash wherever a count was never asked. */
function formatGpla(pregnancy: Pregnancy): string {
  const { gravida, parity, living, abortions } = pregnancy.gravidaParity
  const part = (label: string, value: number | null) => `${label}${value ?? '–'}`
  return [part('G', gravida), part('P', parity), part('L', living), part('A', abortions)].join(' ')
}

function Pill({ tone, icon, children }: { tone: 'alert' | 'caution'; icon?: React.ReactNode; children: React.ReactNode }) {
  const styles =
    tone === 'alert' ? 'border-alert-200 bg-alert-50 text-alert-700' : 'border-caution-200 bg-caution-50 text-caution-900'

  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      {icon ? (
        <span aria-hidden className={tone === 'alert' ? 'text-alert-600' : 'text-caution-600'}>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
