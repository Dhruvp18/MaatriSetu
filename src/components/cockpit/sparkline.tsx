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

const WIDTH = 560
const HEIGHT = 240
const PADDING_X = 50
const PADDING_Y = 40

export function Sparkline({ 
  series, 
  threshold, 
  thresholdLabel,
  colorClass = 'text-brand-600'
}: { 
  series: TrendSeries, 
  threshold?: number, 
  thresholdLabel?: string,
  colorClass?: string 
}) {
  const { points, unit } = series

  const values = points.map((p) => p.value)
  const latest = values[values.length - 1]

  return (
    <div className="flex flex-col gap-3 overflow-x-auto pb-2">
      <span className="sr-only">
        {points.length > 1
          ? `Latest ${latest} ${unit}, from ${points.length} values between ${points[0]?.observedDate} and ${points[points.length - 1]?.observedDate}.`
          : `One value recorded, ${latest} ${unit}.`}
      </span>
      {points.length > 0 ? (
        <Line points={points} unit={unit} threshold={threshold} thresholdLabel={thresholdLabel} colorClass={colorClass} />
      ) : (
        <span className="text-xs text-slate-400">No values recorded</span>
      )}
    </div>
  )
}

function Line({ 
  points, 
  unit, 
  threshold, 
  thresholdLabel,
  colorClass 
}: { 
  points: readonly import('@modules/reports/report.types').TrendPoint[], 
  unit: string, 
  threshold?: number, 
  thresholdLabel?: string,
  colorClass: string 
}) {
  if (!points || points.length === 0) return null

  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  
  if (threshold !== undefined) {
    min = Math.min(min, threshold)
    max = Math.max(max, threshold)
  }
  
  // Create headroom
  const span = max - min || 1
  const displayMin = Math.max(0, min - span * 0.2)
  const displayMax = max + span * 0.3
  const displaySpan = displayMax - displayMin

  const usableWidth = WIDTH - PADDING_X * 2
  const usableHeight = HEIGHT - PADDING_Y * 2

  // Map points based on their actual date distance if possible
  const times = points.map(p => new Date(p.observedDate).getTime())
  const tMin = times[0] ?? 0
  const tMax = times[times.length - 1] ?? 0
  const tSpan = tMax - tMin || 1

  const coords = points.map((p, index) => {
    const t = new Date(p.observedDate).getTime()
    const xRatio = tSpan > 1 ? (t - tMin) / tSpan : index / (points.length - 1 || 1)
    const x = PADDING_X + xRatio * usableWidth
    const y = PADDING_Y + (1 - (p.value - displayMin) / displaySpan) * usableHeight
    return { x, y, value: p.value, date: p.observedDate }
  })

  // Y-axis ticks (5 grid lines)
  const ticks = []
  for (let i = 0; i <= 4; i++) {
    const val = displayMin + (i * displaySpan) / 4
    const y = PADDING_Y + usableHeight - (i * usableHeight) / 4
    ticks.push({ val, y })
  }

  const fillId = `spark-${values.join('-')}`
  const strokeColor = "#c43f55" // Using a reddish color similar to the user's reference image

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`shrink-0 overflow-visible`}
      aria-hidden
      focusable="false"
    >
      {/* Grid Lines */}
      {ticks.map((tick, i) => (
        <g key={i}>
          <line x1={PADDING_X} y1={tick.y} x2={WIDTH - PADDING_X} y2={tick.y} stroke="#f1f5f9" strokeWidth="1.5" />
          <text x={PADDING_X - 10} y={tick.y + 4} fontSize="11" fill="#64748b" textAnchor="end">
            {tick.val.toFixed(1).replace(/\.0$/, '')}
          </text>
        </g>
      ))}

      {/* Y-axis Unit */}
      <text x={PADDING_X - 10} y={PADDING_Y - 15} fontSize="10" fill="#94a3b8" textAnchor="end" fontStyle="italic">
        ({unit})
      </text>

      {/* Threshold Line */}
      {threshold !== undefined && (
        <g>
          <line 
            x1={PADDING_X} 
            y1={PADDING_Y + (1 - (threshold - displayMin) / displaySpan) * usableHeight} 
            x2={WIDTH - PADDING_X} 
            y2={PADDING_Y + (1 - (threshold - displayMin) / displaySpan) * usableHeight} 
            stroke="#10b981" 
            strokeWidth="1.5" 
            strokeDasharray="4,4" 
          />
          {thresholdLabel && (
            <text 
              x={WIDTH - PADDING_X} 
              y={PADDING_Y + (1 - (threshold - displayMin) / displaySpan) * usableHeight - 6} 
              fontSize="11" 
              fill="#059669" 
              fontWeight="600"
              textAnchor="end"
            >
              {thresholdLabel}
            </text>
          )}
        </g>
      )}

      {/* Line */}
      <polyline
        points={coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Points & Labels */}
      {coords.map((c, i) => {
        const d = new Date(c.date)
        const label = `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`
        return (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="5" fill="#fff" stroke={strokeColor} strokeWidth="2.5" />
            <text x={c.x} y={c.y - 12} fontSize="13" fontWeight="600" fill={strokeColor} textAnchor="middle">
              {c.value.toFixed(1).replace(/\.0$/, '')}
            </text>
            <text x={c.x} y={HEIGHT - PADDING_Y + 20} fontSize="11" fill="#64748b" textAnchor="middle">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
