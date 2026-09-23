import type { TrendSeries } from '@modules/reports/report.types'

/**
 * A serial lab trend (PRD F7).
 *
 * Renders the numbers first and the line second, deliberately. A sparkline
 * alone tells a clinician that something fell without telling them from what to
 * what, and "11.2 → 9.8 → 8.6 g/dL" is the part that gets acted on. The line is
 * there to make the shape visible at a glance, not to replace the values.
 *
 * Inline SVG with no library: this renders on the server, inside a payload that
 * has to arrive in one round trip, and a charting dependency would cost more
 * than the forty lines it saves.
 *
 * Nothing here colours a value by whether it is high or low. The system does not
 * classify findings (PRD §3), so the line is drawn in one neutral colour
 * regardless of direction. This is the one place the Stitch reference is not
 * copied: it prints the same three values in green, amber and red. Those are a
 * severity judgment, and they are not ours to make.
 */

const WIDTH = 96
const HEIGHT = 24
const PADDING = 2

export function Sparkline({ series }: { series: TrendSeries }) {
  const { points, unit } = series

  const values = points.map((p) => p.value)
  const latest = values[values.length - 1]

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="numeric flex items-center gap-1.5 text-xs">
        {values.map((value, index) => (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden className="text-slate-400">
                ➔
              </span>
            ) : null}
            <span
              className={
                index === values.length - 1
                  ? 'font-bold text-slate-900'
                  : 'font-medium text-slate-600'
              }
            >
              {value}
            </span>
          </span>
        ))}
        <span className="text-[10px] font-normal text-slate-500">{unit}</span>
      </span>
      {points.length > 1 ? <Line values={values} /> : null}
      {points.length === 1 ? (
        // One value is not a trend, and drawing a flat line would imply it was
        // stable rather than measured once.
        <span className="text-xs text-slate-400">single value</span>
      ) : null}
      <span className="sr-only">
        {points.length > 1
          ? `Latest ${latest} ${unit}, from ${points.length} values between ${points[0]?.observedDate} and ${points[points.length - 1]?.observedDate}.`
          : `One value recorded, ${latest} ${unit}.`}
      </span>
    </div>
  )
}

function Line({ values }: { values: readonly number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1

  const usableWidth = WIDTH - PADDING * 2
  const usableHeight = HEIGHT - PADDING * 2

  const coords = values.map((value, index) => {
    const x = PADDING + (index / (values.length - 1)) * usableWidth
    // SVG y grows downward, so a higher value must sit nearer the top.
    const y = PADDING + (1 - (value - min) / span) * usableHeight
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const lastCoord = coords[coords.length - 1]?.split(',')

  // An id unique to this series, so two sparklines on one page do not share a
  // gradient definition.
  const fillId = `spark-${values.join('-')}`

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="shrink-0 overflow-visible text-brand-600"
      aria-hidden
      focusable="false"
    >
      <defs>
        {/* The design system's area treatment: indigo at 15% fading out. */}
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      <polygon
        points={`${PADDING},${HEIGHT} ${coords.join(' ')} ${WIDTH - PADDING},${HEIGHT}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastCoord ? <circle cx={lastCoord[0]} cy={lastCoord[1]} r={2.5} fill="currentColor" /> : null}
    </svg>
  )
}
