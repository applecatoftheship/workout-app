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
  valueToY,
} from '../../utils/chartHelpers'

type SleepChartProps = {
  periodConditions: DailyCondition[]
  targetSleepHours: number
}

export function SleepChart({ periodConditions, targetSleepHours }: SleepChartProps) {
  if (periodConditions.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const sleepValues = periodConditions.map((condition) => condition.sleepHours)
  const { min, range } = computeScale([...sleepValues, targetSleepHours])
  const points = pointsFor(sleepValues, min, range)
  const areaPath = areaPathFor(sleepValues, min, range)
  const targetY = valueToY(targetSleepHours, min, range)
  const ticks = buildAxisTicks(min, range, 1)
  const latestSleep = sleepValues[sleepValues.length - 1]
  const previousSleep = sleepValues.length > 1 ? sleepValues[sleepValues.length - 2] : null
  const sleepDiff = previousSleep != null ? latestSleep - previousSleep : null

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">睡眠時間</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {latestSleep.toFixed(1)}
            <span className="chart-card__value-unit">h</span>
          </span>
          {sleepDiff != null && Math.abs(sleepDiff) >= 0.05 ? (
            <span className={`trend-badge ${sleepDiff > 0 ? 'trend-badge--good' : 'trend-badge--warning'}`}>
              {sleepDiff > 0 ? '+' : ''}
              {sleepDiff.toFixed(1)}h
            </span>
          ) : null}
        </div>
      </div>
      <p className="progress-graph__goal-note">目標 {targetSleepHours.toFixed(1)}時間</p>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <line
          x1={MARGIN_LEFT}
          y1={targetY}
          x2={CHART_WIDTH - MARGIN_RIGHT}
          y2={targetY}
          className="progress-graph__target-line"
        />
        <path d={areaPath} className="progress-graph__area progress-graph__area--data" />
        <polyline points={points.join(' ')} fill="none" className="progress-graph__line progress-graph__line--data" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--data" />
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
