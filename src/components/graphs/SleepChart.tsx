import { useState } from 'react'
import type { DisplaySleepHoursPoint, MAPoint } from '../../utils/chartHelpers'
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
  // 睡眠時間0時間表示バグ対応（Phase 1-2、2026年9月14日。WeightChart.tsxの
  // periodWeightSeriesと同型）：体調記録はあるが睡眠時間未入力の日を0時間として
  // 描かないよう、ProgressGraph側で「その日の実測値、なければ直近実測値の引き継ぎ」に
  // 解決済みの系列を受け取る（buildDisplaySleepHoursSeries）。
  periodSleepSeries: DisplaySleepHoursPoint[]
  periodSleepMA: MAPoint[]
  targetSleepHours: number
}

export function SleepChart({ periodSleepSeries, periodSleepMA, targetSleepHours }: SleepChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (periodSleepSeries.length === 0) {
    // 2026年9月18日：空状態文言の統一（UIブラッシュアップPhase1・低リスク改善#9）。
    return <p className="progress-graph__empty">まだ睡眠記録がありません</p>
  }

  const maByDate = new Map(periodSleepMA.map((point) => [point.date, point.movingAvg]))
  const sleepValues = periodSleepSeries.map((point) => point.sleepHours)
  const maValues = periodSleepSeries.map((point) => maByDate.get(point.date) ?? point.sleepHours)

  const { min, range } = computeScale([...sleepValues, ...maValues, targetSleepHours])
  const actualPoints = pointsFor(sleepValues, min, range)
  const maPoints = pointsFor(maValues, min, range)
  const areaPath = areaPathFor(maValues, min, range)
  const targetY = valueToY(targetSleepHours, min, range)
  const ticks = buildAxisTicks(min, range, 1)
  const latestMA = maValues[maValues.length - 1]
  const previousMA = maValues.length > 1 ? maValues[maValues.length - 2] : null
  const maDiff = previousMA != null ? latestMA - previousMA : null

  const selectedPoint = selectedDate ? periodSleepSeries.find((point) => point.date === selectedDate) : null
  const selectedMA = selectedDate ? maByDate.get(selectedDate) : null

  return (
    <div className="progress-graph__chart-wrapper">
      <div className="chart-card__header">
        <h3 className="chart-card__title">睡眠時間</h3>
        <div className="chart-card__value-group">
          <span className="chart-card__value metric-value">
            {latestMA.toFixed(1)}
            <span className="chart-card__value-unit">h（7日平均）</span>
          </span>
          {maDiff != null && Math.abs(maDiff) >= 0.05 ? (
            <span className={`trend-badge ${maDiff > 0 ? 'trend-badge--good' : 'trend-badge--warning'}`}>
              {maDiff > 0 ? '+' : ''}
              {maDiff.toFixed(1)}h
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
        <path d={areaPath} className="progress-graph__area progress-graph__area--ma-sleep" />
        <polyline points={actualPoints.join(' ')} fill="none" className="progress-graph__line progress-graph__line--actual" />
        <polyline
          points={maPoints.join(' ')}
          fill="none"
          className="progress-graph__line progress-graph__line--ma-sleep progress-graph__line--emphasis"
        />
        {actualPoints.map((point, index) => {
          const [cx, cy] = point.split(',').map(Number)
          const seriesPoint = periodSleepSeries[index]
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
              key={`ma-${periodSleepSeries[index].date}`}
              cx={cx}
              cy={cy}
              r="4"
              className="progress-graph__dot progress-graph__dot--ma-sleep progress-graph__dot--emphasis"
              onClick={() => setSelectedDate(periodSleepSeries[index].date)}
            />
          )
        })}
      </svg>
      <div className="progress-graph__legend">
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--actual" />実測</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--ma-sleep" />7日移動平均</span>
        <span className="progress-graph__legend-item"><span className="progress-graph__legend-dot progress-graph__legend-dot--target" />目標</span>
      </div>
      {selectedPoint ? (
        <p className="chart-card__tooltip">
          {selectedPoint.date.replace(/-/g, '/')}｜{selectedPoint.isActual ? '実測' : '直近値'}: {selectedPoint.sleepHours.toFixed(1)}時間
          {selectedMA != null ? ` / 7日平均: ${selectedMA.toFixed(1)}時間` : ''}
        </p>
      ) : null}
      <div className="progress-graph__labels">
        {periodSleepSeries.map((point, index) =>
          shouldShowLabel(index, periodSleepSeries.length) ? (
            <span key={point.date}>{formatShortDate(point.date)}</span>
          ) : null,
        )}
      </div>
    </div>
  )
}
