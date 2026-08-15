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
  toDateKey,
  valueToY,
} from '../../utils/chartHelpers'

type WeightChartProps = {
  periodConditions: DailyCondition[]
  targetWeight: number
  periodEnd: Date
  periodEndKey: string
}

export function WeightChart({ periodConditions, targetWeight, periodEnd, periodEndKey }: WeightChartProps) {
  if (periodConditions.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const weightValues = periodConditions.map((condition) => condition.weight)
  const firstCondition = periodConditions[0]
  const startDate = new Date(`${firstCondition.date}T00:00:00`)
  const endDate = periodEnd
  const idealValues: number[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const dateKey = toDateKey(cursor)
    if (dateKey >= firstCondition.date && dateKey <= periodEndKey) {
      const totalMs = endDate.getTime() - startDate.getTime()
      const progressRatio = totalMs === 0 ? 1 : (cursor.getTime() - startDate.getTime()) / totalMs
      idealValues.push(firstCondition.weight + (targetWeight - firstCondition.weight) * progressRatio)
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  const { min, range } = computeScale([...weightValues, ...idealValues, targetWeight])
  const actualPoints = pointsFor(weightValues, min, range)
  const idealPoints = idealValues.length > 1 ? pointsFor(idealValues, min, range) : null
  const areaPath = areaPathFor(weightValues, min, range)
  const targetY = valueToY(targetWeight, min, range)
  const ticks = buildAxisTicks(min, range, 1)
  const latestWeight = periodConditions[periodConditions.length - 1].weight
  const previousWeight = periodConditions.length > 1 ? periodConditions[periodConditions.length - 2].weight : null
  const weightDiff = previousWeight != null ? latestWeight - previousWeight : null

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">体重</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {latestWeight.toFixed(1)}
            <span className="chart-card__value-unit">kg</span>
          </span>
          {weightDiff != null && Math.abs(weightDiff) >= 0.05 ? (
            <span className={`trend-badge ${weightDiff > 0 ? 'trend-badge--warning' : 'trend-badge--good'}`}>
              {weightDiff > 0 ? '+' : ''}
              {weightDiff.toFixed(1)}kg
            </span>
          ) : null}
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        <defs>
          <linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
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
        {idealPoints ? (
          <polyline points={idealPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--ideal" />
        ) : null}
        <path d={areaPath} className="progress-graph__area" fill="url(#weightAreaGradient)" />
        <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--accent" />
        {actualPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return <circle key={periodConditions[index].date} cx={cx} cy={cy} r="4" className="progress-graph__dot progress-graph__dot--accent" />
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ideal" />理想ライン</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--target" />目標</span>
      </div>
      <div className="progress-graph__labels">
        {periodConditions.map((condition, index) => (
          <span key={condition.date}>
            {shouldShowLabel(index, periodConditions.length) ? formatShortDate(condition.date) : ''}
          </span>
        ))}
      </div>
      <div className="progress-graph__metrics">
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">現在の体重</span>
          <strong>{latestWeight.toFixed(1)}kg</strong>
        </div>
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">目標体重</span>
          <strong>{targetWeight.toFixed(1)}kg</strong>
        </div>
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">目標までの差</span>
          <strong>{(latestWeight - targetWeight).toFixed(1)}kg</strong>
        </div>
      </div>
    </div>
  )
}
