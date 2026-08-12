import type { DailyCondition } from '../../types'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  areaPathFor,
  buildAxisTicks,
  computeScale,
  formatShortDate,
  pointsFor,
  shouldShowLabel,
} from '../../utils/chartHelpers'

type FatigueChartProps = {
  periodConditions: DailyCondition[]
}

export function FatigueChart({ periodConditions }: FatigueChartProps) {
  if (periodConditions.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const fatigueValues = periodConditions.map((condition) => condition.fatigue)
  const { min, range } = computeScale(fatigueValues.length > 0 ? [1, 5, ...fatigueValues] : [1, 5])
  const points = pointsFor(fatigueValues, min, range)
  const areaPath = areaPathFor(fatigueValues, min, range)
  const ticks = buildAxisTicks(min, range, 0)

  return (
    <div className="progress-graph__chart-wrapper">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <path d={areaPath} className="progress-graph__area progress-graph__area--amber" />
        <polyline points={points.join(' ')} fill="none" className="progress-graph__line progress-graph__line--amber" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--amber" />
        })}
      </svg>
      <div className="progress-graph__labels">
        {periodConditions.map((condition, index) => (
          <span key={condition.date}>
            {shouldShowLabel(index, periodConditions.length) ? formatShortDate(condition.date) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
