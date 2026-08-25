import { useState } from 'react'
import './WeeklyACWRDetailModal.css'
import type { ACWRInsightTier, DailyACWRPoint } from '../utils/acwrHelpers'
import { getACWRInsight } from '../utils/acwrHelpers'
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  DISPLAY_WIDTH,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  buildAxisTicks,
  formatShortDate,
  shouldShowLabel,
  valueToX,
  valueToY,
} from '../utils/chartHelpers'
import { CloseIcon } from './icons'

type WeeklyACWRDetailModalProps = {
  /** todayDateを終端とする直近28日分のDailyACWRPoint（Dashboard.tsx側で計算済みのものをそのまま渡す） */
  seriesPoints: DailyACWRPoint[]
  chronicDaysAvailable: number
  daysUntilAvailable: number
  onClose: () => void
}

const ACWR_AXIS_MIN = 0
const ACWR_AXIS_RANGE = 2.0

const TIER_TONE: Record<ACWRInsightTier, string> = {
  unload: 'warning',
  recovery: 'good',
  optimal: 'accent',
  surge: 'warning',
  spike: 'danger',
}

export function WeeklyACWRDetailModal({ seriesPoints, chronicDaysAvailable, daysUntilAvailable, onClose }: WeeklyACWRDetailModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // アプリ利用開始直後はseries先頭側の日がまだ7日分のデータに満たずnullになりうる
  // （calculateDailyACWRSeriesの仕様）。折れ線は実際に値がある日のみで描画する
  // （WeightChart等が「記録がある日のみ」の疎な配列を使う既存パターンと同じ判断）。
  const availablePoints = seriesPoints.filter((point) => point.acwr != null) as { date: string; acwr: number }[]

  if (availablePoints.length === 0) {
    return (
      <div className="weekly-acwr-detail__overlay" role="presentation" onClick={onClose}>
        <div
          className="weekly-acwr-detail"
          role="dialog"
          aria-modal="true"
          aria-label="週次ACWRトレンド"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="weekly-acwr-detail__header">
            <h3>週次ACWRトレンド</h3>
            <button type="button" className="weekly-acwr-detail__close" onClick={onClose} aria-label="閉じる">
              <CloseIcon />
            </button>
          </div>
          <div className="weekly-acwr-detail__body">
            <p className="weekly-acwr-detail__pending">
              データ蓄積中（{Math.max(0, 7 - daysUntilAvailable)}/7日）。ACWRの算出には最低7日分の記録が必要です。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const values = availablePoints.map((point) => point.acwr)
  const ticks = buildAxisTicks(ACWR_AXIS_MIN, ACWR_AXIS_RANGE, 1)
  const points = values.map((value, index) => `${valueToX(index, values.length)},${valueToY(value, ACWR_AXIS_MIN, ACWR_AXIS_RANGE)}`)

  const bandY = (value: number) => valueToY(value, ACWR_AXIS_MIN, ACWR_AXIS_RANGE)
  const bands = [
    { from: 0, to: 0.8, tone: 'danger' },
    { from: 0.8, to: 1.3, tone: 'good' },
    { from: 1.3, to: 1.5, tone: 'warning' },
    { from: 1.5, to: 2.0, tone: 'danger' },
  ]

  const latest = availablePoints[availablePoints.length - 1]
  const insight = getACWRInsight(latest.acwr)
  const selectedPoint = selectedDate ? availablePoints.find((point) => point.date === selectedDate) : null

  return (
    <div className="weekly-acwr-detail__overlay" role="presentation" onClick={onClose}>
      <div
        className="weekly-acwr-detail"
        role="dialog"
        aria-modal="true"
        aria-label="週次ACWRトレンド"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="weekly-acwr-detail__header">
          <h3>週次ACWRトレンド</h3>
          <button type="button" className="weekly-acwr-detail__close" onClick={onClose} aria-label="閉じる">
            <CloseIcon />
          </button>
        </div>

        <div className="weekly-acwr-detail__body">
          <div className="weekly-acwr-detail__score-row">
            <span className="weekly-acwr-detail__score metric-value">{latest.acwr.toFixed(2)}</span>
            <span className={`weekly-acwr-detail__badge weekly-acwr-detail__badge--${TIER_TONE[insight.tier]}`}>{insight.title}</span>
          </div>

          {chronicDaysAvailable < 28 ? (
            <p className="weekly-acwr-detail__note">直近{chronicDaysAvailable}日分のデータで算出</p>
          ) : null}

          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="progress-graph__svg weekly-acwr-detail__svg" aria-hidden="true">
            {bands.map((band) => (
              <rect
                key={band.tone + band.from}
                x={MARGIN_LEFT}
                y={bandY(band.to)}
                width={DISPLAY_WIDTH}
                height={Math.max(0, bandY(band.from) - bandY(band.to))}
                className={`weekly-acwr-detail__band weekly-acwr-detail__band--${band.tone}`}
              />
            ))}
            {ticks.map((tick) => (
              <g key={tick.y}>
                <line x1={MARGIN_LEFT} y1={tick.y} x2={CHART_WIDTH - MARGIN_RIGHT} y2={tick.y} className="progress-graph__gridline" />
                <text x={MARGIN_LEFT - 6} y={tick.y + 3} className="progress-graph__axis-label" textAnchor="end">
                  {tick.label}
                </text>
              </g>
            ))}
            <polyline points={points.join(' ')} fill="none" className="progress-graph__line weekly-acwr-detail__line" />
            {points.map((point, index) => {
              const [cx, cy] = point.split(',').map(Number)
              const isSpike = availablePoints[index].acwr > 1.5
              return (
                <circle
                  key={availablePoints[index].date}
                  cx={cx}
                  cy={cy}
                  r={isSpike ? 4.5 : 3}
                  className={`progress-graph__dot weekly-acwr-detail__dot ${isSpike ? 'weekly-acwr-detail__dot--spike' : ''}`}
                  onClick={() => setSelectedDate(availablePoints[index].date)}
                />
              )
            })}
          </svg>

          {selectedPoint ? (
            <p className="chart-card__tooltip">
              {selectedPoint.date.replace(/-/g, '/')}｜ACWR: {selectedPoint.acwr.toFixed(2)}
            </p>
          ) : null}

          <div className="progress-graph__labels">
            {availablePoints.map((point, index) =>
              shouldShowLabel(index, availablePoints.length) ? <span key={point.date}>{formatShortDate(point.date)}</span> : null,
            )}
          </div>

          <p className="weekly-acwr-detail__insight-body">{insight.body}</p>
        </div>
      </div>
    </div>
  )
}
