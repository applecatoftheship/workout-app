import { useState } from 'react'
import type { DisplayWeightPoint, MAPoint } from '../../utils/chartHelpers'
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
  // 体重0kg表示バグ対応（2026年9月3日）：体調記録はあるが体重未入力の日を
  // 0kgとして描かないよう、ProgressGraph側で「その日の実測値、なければ直近実測値の
  // 引き継ぎ」に解決済みの系列を受け取る（buildDisplayWeightSeries）。
  periodWeightSeries: DisplayWeightPoint[]
  periodWeightMA: MAPoint[]
  targetWeight: number
  periodEnd: Date
  periodEndKey: string
}

export function WeightChart({ periodWeightSeries, periodWeightMA, targetWeight, periodEnd, periodEndKey }: WeightChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (periodWeightSeries.length === 0) {
    return <p className="progress-graph__empty">データがありません</p>
  }

  const maByDate = new Map(periodWeightMA.map((point) => [point.date, point.movingAvg]))
  const weightValues = periodWeightSeries.map((point) => point.weight)
  // 期間の先頭付近ではmovingAverageが期間外のデータも含めて計算されているため、
  // periodWeightMAに該当日のデータがない場合は実測値でフォールバックして線が途切れないようにする。
  const maValues = periodWeightSeries.map((point) => maByDate.get(point.date) ?? point.weight)

  const firstCondition = periodWeightSeries[0]
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

  const { min, range } = computeScale([...weightValues, ...maValues, ...idealValues, targetWeight])
  const actualPoints = pointsFor(weightValues, min, range)
  const maPoints = pointsFor(maValues, min, range)
  const idealPoints = idealValues.length > 1 ? pointsFor(idealValues, min, range) : null
  const areaPath = areaPathFor(maValues, min, range)
  const targetY = valueToY(targetWeight, min, range)
  const ticks = buildAxisTicks(min, range, 1)
  const latestMA = maValues[maValues.length - 1]
  const previousMA = maValues.length > 1 ? maValues[maValues.length - 2] : null
  const maDiff = previousMA != null ? latestMA - previousMA : null

  const selectedPoint = selectedDate ? periodWeightSeries.find((point) => point.date === selectedDate) : null
  const selectedMA = selectedDate ? maByDate.get(selectedDate) : null

  const lastPoint = periodWeightSeries[periodWeightSeries.length - 1]

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">体重</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {latestMA.toFixed(1)}
            <span className="chart-card__value-unit">kg（7日平均）</span>
          </span>
          {maDiff != null && Math.abs(maDiff) >= 0.05 ? (
            <span className={`trend-badge ${maDiff > 0 ? 'trend-badge--warning' : 'trend-badge--good'}`}>
              {maDiff > 0 ? '+' : ''}
              {maDiff.toFixed(1)}kg
            </span>
          ) : null}
        </div>
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg" aria-hidden="true">
        <defs>
          <linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-ma-weight)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-ma-weight)" stopOpacity="0" />
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
        <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--actual" />
        <polyline points={maPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--ma-weight" />
        {actualPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          const seriesPoint = periodWeightSeries[index]
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
              key={`ma-${periodWeightSeries[index].date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--ma-weight"
              onClick={() => setSelectedDate(periodWeightSeries[index].date)}
            />
          )
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ma-weight" />7日移動平均</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ideal" />理想ライン</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--target" />目標</span>
      </div>
      {selectedPoint ? (
        <p className="chart-card__tooltip">
          {selectedPoint.date.replace(/-/g, '/')}｜{selectedPoint.isActual ? '実測' : '直近値'}: {selectedPoint.weight.toFixed(1)}kg
          {selectedMA != null ? ` / 7日平均: ${selectedMA.toFixed(1)}kg` : ''}
        </p>
      ) : null}
      <div className="progress-graph__labels">
        {periodWeightSeries.map((point, index) =>
          shouldShowLabel(index, periodWeightSeries.length) ? (
            <span key={point.date}>{formatShortDate(point.date)}</span>
          ) : null,
        )}
      </div>
      <div className="progress-graph__metrics">
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">{lastPoint.isActual ? '本日実測' : '直近実測'}</span>
          <strong>{lastPoint.weight.toFixed(1)}kg</strong>
        </div>
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">目標体重</span>
          <strong>{targetWeight.toFixed(1)}kg</strong>
        </div>
        <div className="progress-graph__metric">
          <span className="progress-graph__metric-label">目標までの差</span>
          <strong>{(latestMA - targetWeight).toFixed(1)}kg</strong>
        </div>
      </div>
    </div>
  )
}
