import { useState } from 'react'
import type { DisplayFatiguePoint, MAPoint } from '../../utils/chartHelpers'
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
  // 疲労度0値表示バグ対応（Phase 1-2、2026年9月14日。WeightChart.tsxの
  // periodWeightSeriesと同型）：体調記録はあるが疲労度未選択の日を実測3として
  // 描かないよう、ProgressGraph側で「その日の実測値、なければ直近実測値の引き継ぎ」に
  // 解決済みの系列を受け取る（buildDisplayFatigueSeries）。
  periodFatigueSeries: DisplayFatiguePoint[]
  periodFatigueMA: MAPoint[]
}

export function FatigueChart({ periodFatigueSeries, periodFatigueMA }: FatigueChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (periodFatigueSeries.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const maByDate = new Map(periodFatigueMA.map((point) => [point.date, point.movingAvg]))
  const fatigueValues = periodFatigueSeries.map((point) => point.fatigue)
  const maValues = periodFatigueSeries.map((point) => maByDate.get(point.date) ?? point.fatigue)

  const { min, range } = computeScale([1, 5, ...fatigueValues, ...maValues])
  const actualPoints = pointsFor(fatigueValues, min, range)
  const maPoints = pointsFor(maValues, min, range)
  const areaPath = areaPathFor(maValues, min, range)
  const ticks = buildAxisTicks(min, range, 0)
  const latestMA = maValues[maValues.length - 1]
  const previousMA = maValues.length > 1 ? maValues[maValues.length - 2] : null
  const maDiff = previousMA != null ? latestMA - previousMA : null

  const selectedPoint = selectedDate ? periodFatigueSeries.find((point) => point.date === selectedDate) : null
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
          const seriesPoint = periodFatigueSeries[index]
          return (
            <circle
              key={`actual-${seriesPoint.date}`}
              cx={cx}
              cy={cy}
              r="3"
              className={`progress-graph__dot progress-graph__dot--actual${
                seriesPoint.isActual ? '' : ' progress-graph__dot--carried'
              }`}
              onClick={() => setSelectedDate(seriesPoint.date)}
            />
          )
        })}
        {maPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          return (
            <circle
              key={`ma-${periodFatigueSeries[index].date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--ma-fatigue"
              onClick={() => setSelectedDate(periodFatigueSeries[index].date)}
            />
          )
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ma-fatigue" />7日移動平均</span>
      </div>
      {selectedPoint ? (
        <p className="chart-card__tooltip">
          {selectedPoint.date.replace(/-/g, '/')}｜{selectedPoint.isActual ? '実測' : '直近値'}: {selectedPoint.fatigue}/5
          {selectedMA != null ? ` / 7日平均: ${selectedMA.toFixed(1)}/5` : ''}
        </p>
      ) : null}
      <div className="progress-graph__labels">
        {periodFatigueSeries.map((point, index) =>
          shouldShowLabel(index, periodFatigueSeries.length) ? (
            <span key={point.date}>{formatShortDate(point.date)}</span>
          ) : null,
        )}
      </div>
    </div>
  )
}
