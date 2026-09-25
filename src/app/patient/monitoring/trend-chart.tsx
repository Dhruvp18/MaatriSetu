'use client'

import { useMemo, useState } from 'react'

import type { Lang } from '../lib/i18n/locales'
import { formatDateTime } from '../lib/i18n/locales'
import { GLUCOSE_CONTEXT_LABELS, type HomeReading, type HomeReadingMetric } from '@/modules/monitoring/monitoring.types'

/**
 * The home-monitoring trend chart.
 *
 * Inline SVG, no charting library — same choice `components/cockpit/sparkline`
 * makes and for the same reason: this renders inside a payload that already
 * has to arrive in one round trip, and a dependency would cost more than the
 * chart is worth. The reference lines are drawn the same way the cockpit draws
 * them (`Sparkline`'s `threshold` prop): a labelled, neutral-coloured line
 * stating a standard clinical number, never a colour judgment on her own
 * readings — the system does not decide what is normal for her (PRD §3).
 */

const WIDTH = 640
const HEIGHT = 260
const PAD_X = 44
const PAD_Y = 32

type RangeKey = 'WEEK' | 'MONTH' | 'ALL'
const RANGE_DAYS: Record<'WEEK' | 'MONTH', number> = { WEEK: 7, MONTH: 30 }

interface Point {
  readonly t: number
  readonly v: number
}

interface Series {
  readonly label: string
  readonly colorVar: string
  readonly points: readonly Point[]
}

interface ReferenceLine {
  readonly value: number
  readonly label: string
}

export function TrendChart({
  metric,
  readings,
  lang,
  labels,
}: {
  metric: HomeReadingMetric
  readings: readonly HomeReading[]
  lang: Lang
  labels: {
    week: string
    month: string
    all: string
    noReadings: string
    unitGlucose: string
    unitBp: string
  }
}) {
  const [range, setRange] = useState<RangeKey>('WEEK')

  const filtered = useMemo(() => {
    if (range === 'ALL') return readings
    const cutoffMs = Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000
    return readings.filter((r) => new Date(r.recordedAt).getTime() >= cutoffMs)
  }, [readings, range])

  const { series, referenceLines, unit } = useMemo(() => buildSeries(metric, filtered), [metric, filtered])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(['WEEK', 'MONTH', 'ALL'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setRange(key)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
              range === key ? 'bg-[#8a3c4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {key === 'WEEK' ? labels.week : key === 'MONTH' ? labels.month : labels.all}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 py-8 text-center text-sm text-slate-400 italic">
          {labels.noReadings}
        </p>
      ) : (
        <Chart series={series} referenceLines={referenceLines} unit={unit === 'glucose' ? labels.unitGlucose : labels.unitBp} />
      )}

      {filtered.length > 0 ? (
        <ul className="flex max-h-40 flex-col-reverse gap-1.5 overflow-y-auto pr-1">
          {filtered.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
              <span className="text-slate-500">{formatDateTime(r.recordedAt, lang)}</span>
              <span className="font-bold text-slate-800">
                {r.glucose ? `${r.glucose.mgDl} mg/dL · ${GLUCOSE_CONTEXT_LABELS[r.glucose.context]}` : null}
                {r.bloodPressure ? `${r.bloodPressure.systolicMmHg}/${r.bloodPressure.diastolicMmHg} mmHg` : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function buildSeries(
  metric: HomeReadingMetric,
  readings: readonly HomeReading[],
): { series: readonly Series[]; referenceLines: readonly ReferenceLine[]; unit: 'glucose' | 'bp' } {
  if (metric === 'BLOOD_GLUCOSE') {
    const points = readings
      .filter((r): r is HomeReading & { glucose: NonNullable<HomeReading['glucose']> } => r.glucose !== null)
      .map((r) => ({ t: new Date(r.recordedAt).getTime(), v: r.glucose.mgDl }))
    return {
      series: [{ label: 'Blood sugar', colorVar: '#b84c63', points }],
      referenceLines: [
        { value: 95, label: 'Fasting target < 95' },
        { value: 140, label: 'Post-meal target < 140' },
      ],
      unit: 'glucose',
    }
  }

  const systolic = readings
    .filter((r): r is HomeReading & { bloodPressure: NonNullable<HomeReading['bloodPressure']> } => r.bloodPressure !== null)
    .map((r) => ({ t: new Date(r.recordedAt).getTime(), v: r.bloodPressure.systolicMmHg }))
  const diastolic = readings
    .filter((r): r is HomeReading & { bloodPressure: NonNullable<HomeReading['bloodPressure']> } => r.bloodPressure !== null)
    .map((r) => ({ t: new Date(r.recordedAt).getTime(), v: r.bloodPressure.diastolicMmHg }))

  return {
    series: [
      { label: 'Systolic', colorVar: '#8a3c4a', points: systolic },
      { label: 'Diastolic', colorVar: '#c98a9a', points: diastolic },
    ],
    referenceLines: [
      { value: 140, label: 'Normal systolic < 140' },
      { value: 90, label: 'Normal diastolic < 90' },
    ],
    unit: 'bp',
  }
}

function Chart({
  series,
  referenceLines,
  unit,
}: {
  series: readonly Series[]
  referenceLines: readonly ReferenceLine[]
  unit: string
}) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length === 0) return null

  const values = [...allPoints.map((p) => p.v), ...referenceLines.map((r) => r.value)]
  const times = allPoints.map((p) => p.t)

  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const vPad = Math.max((maxV - minV) * 0.15, 5)
  const yMin = Math.max(0, minV - vPad)
  const yMax = maxV + vPad

  const minT = Math.min(...times)
  const maxT = Math.max(...times)
  const tSpan = maxT - minT || 1

  const plotW = WIDTH - PAD_X * 2
  const plotH = HEIGHT - PAD_Y * 2

  const x = (t: number) => PAD_X + (allPoints.length === 1 ? plotW / 2 : ((t - minT) / tSpan) * plotW)
  const y = (v: number) => PAD_Y + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  return (
    <div className="overflow-x-auto pb-1">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[420px]" role="img" aria-label={`${unit} trend chart`}>
        {/* Reference lines: a stated clinical number, never a colour verdict. */}
        {referenceLines.map((ref) => (
          <g key={ref.label}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={y(ref.value)}
              y2={y(ref.value)}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={WIDTH - PAD_X} y={y(ref.value) - 4} textAnchor="end" className="fill-slate-400" fontSize={10}>
              {ref.label}
            </text>
          </g>
        ))}

        {series.map((s) => (
          <g key={s.label}>
            {s.points.length > 1 ? (
              <polyline
                points={s.points.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')}
                fill="none"
                stroke={s.colorVar}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {s.points.map((p, i) => (
              <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3.5} fill={s.colorVar} />
            ))}
          </g>
        ))}

        {/* Legend, only when there is more than one series to tell apart. */}
        {series.length > 1 ? (
          <g>
            {series.map((s, i) => (
              <g key={s.label} transform={`translate(${PAD_X + i * 90}, ${PAD_Y - 16})`}>
                <circle cx={4} cy={0} r={4} fill={s.colorVar} />
                <text x={12} y={4} fontSize={11} className="fill-slate-600">
                  {s.label}
                </text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  )
}
