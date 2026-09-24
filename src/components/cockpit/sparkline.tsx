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

const WIDTH = 300
const HEIGHT = 140
const PADDING_X = 30
const PADDING_Y = 24

export function Sparkline({ series }: { series: TrendSeries }) {
  const { points, unit } = series

  const values = points.map((p) => p.value)
  const latest = values[values.length - 1]

  return (
    <div className="flex flex-col gap-3">
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
      {points.length > 1 ? <Line points={points} /> : null}
      {points.length === 1 ? (
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

function Line({ points }: { points: readonly import('@modules/reports/report.types').TrendPoint[] }) {
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  
  // Create a little headroom for the y-axis
  const span = max - min || 1
  const displayMin = Math.max(0, min - span * 0.2)
  const displayMax = max + span * 0.2
  const displaySpan = displayMax - displayMin

  const usableWidth = WIDTH - PADDING_X * 2
  const usableHeight = HEIGHT - PADDING_Y * 2

  // Map points based on their actual date distance if possible, otherwise even spacing
  const times = points.map(p => new Date(p.observedDate).getTime())
  const tMin = times[0]
  const tMax = times[times.length - 1]
  const tSpan = tMax - tMin || 1

  const coords = points.map((p, index) => {
    const t = new Date(p.observedDate).getTime()
    const xRatio = tSpan > 1 ? (t - tMin) / tSpan : index / (points.length - 1 || 1)
    const x = PADDING_X + xRatio * usableWidth
    const y = PADDING_Y + (1 - (p.value - displayMin) / displaySpan) * usableHeight
    return { x, y, value: p.value, date: p.observedDate }
  })

  const lastCoord = coords[coords.length - 1]
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
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Axes */}
      <line x1={PADDING_X} y1={HEIGHT - PADDING_Y} x2={WIDTH - PADDING_X} y2={HEIGHT - PADDING_Y} stroke="#e2e8f0" strokeWidth="1" />
      <line x1={PADDING_X} y1={PADDING_Y} x2={PADDING_X} y2={HEIGHT - PADDING_Y} stroke="#e2e8f0" strokeWidth="1" />

      {/* Y-axis labels (min/max) */}
      <text x={PADDING_X - 5} y={PADDING_Y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{Math.round(displayMax)}</text>
      <text x={PADDING_X - 5} y={HEIGHT - PADDING_Y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{Math.round(displayMin)}</text>

      {/* Area and Line */}
      <polygon
        points={`${coords[0].x},${HEIGHT - PADDING_Y} ${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')} ${lastCoord.x},${HEIGHT - PADDING_Y}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Points and X-axis labels */}
      {coords.map((c, i) => {
        const d = new Date(c.date)
        const label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 2} fill={i === coords.length - 1 ? 'currentColor' : '#fff'} stroke="currentColor" strokeWidth="1.5" />
            <text x={c.x} y={HEIGHT - PADDING_Y + 12} fontSize="9" fill="#64748b" textAnchor="middle">{label}</text>
          </g>
        )
      })}
    </svg>
  )
}
