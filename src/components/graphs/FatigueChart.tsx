import { useState } from 'react'
import type { DailyCondition } from '../../types'
import type { MAPoint } from '../../utils/chartHelpers'
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
  periodFatigueMA: MAPoint[]
}

export function FatigueChart({ periodConditions, periodFatigueMA }: FatigueChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (periodConditions.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const maByDate = new Map(periodFatigueMA.map((point) => [point.date, point.movingAvg]))
  const fatigueValues = periodConditions.map((condition) => condition.fatigue)
  const maValues = periodConditions.map((condition) => maByDate.get(condition.date) ?? condition.fatigue)

  const { min, range } = computeScale([1, 5, ...fatigueValues, ...maValues])
  const actualPoints = pointsFor(fatigueValues, min, range)
  const maPoints = pointsFor(maValues, min, range)
  const areaPath = areaPathFor(maValues, min, range)
  const ticks = buildAxisTicks(min, range, 0)
  const latestMA = maValues[maValues.length - 1]
  const previousMA = maValues.length > 1 ? maValues[maValues.length - 2] : null
  const maDiff = previousMA != null ? latestMA - previousMA : null

  const selectedCondition = selectedDate ? periodConditions.find((condition) => condition.date === selectedDate) : null
  const selectedMA = selectedDate ? maByDate.get(selectedDate) : null

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">疲労度</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {latestMA.toFixed(1)}
            <span className="chart-card__value-unit">/5（7日平均）</span>
          </span>
          {maDiff != null && Math.abs(maDiff) >= 0.05 ? (
            <span className={`trend-badge ${maDiff > 0 ? 'trend-badge--warning' : 'trend-badge--good'}`}>
              {maDiff > 0 ? '+' : ''}
              {maDiff.toFixed(1)}
            </span>
          ) : null}
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
            <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <path d={areaPath} className="progress-graph__area progress-graph__area--ma-fatigue" />
        <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--actual" />
        <polyline points={maPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--ma-fatigue" />
        {actualPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return (
            <circle
              key={`actual-${periodConditions[index].date}`}
              cx={cx}
              cy={cy}
              r="3"
              className="progress-graph__dot progress-graph__dot--actual"
              onClick={() => setSelectedDate(periodConditions[index].date)}
            />
          )
        })}
        {maPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return (
            <circle
              key={`ma-${periodConditions[index].date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--ma-fatigue"
              onClick={() => setSelectedDate(periodConditions[index].date)}
            />
          )
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ma-fatigue" />7日移動平均</span>
      </div>
      {selectedCondition ? (
        <p className="chart-card__tooltip">
          {selectedCondition.date.replace(/-/g, '/')}｜実測: {selectedCondition.fatigue}/5
          {selectedMA != null ? ` / 7日平均: ${selectedMA.toFixed(1)}/5` : ''}
        </p>
      ) : null}
      <div className="progress-graph__labels">
        {periodConditions.map((condition, index) =>
          shouldShowLabel(index, periodConditions.length) ? (
            <span key={condition.date}>{formatShortDate(condition.date)}</span>
          ) : null,
        )}
      </div>
    </div>
  )
}
