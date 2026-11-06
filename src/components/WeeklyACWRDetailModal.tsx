import { useState } from 'react'
import './WeeklyACWRDetailModal.css'
// 2026年11月6日：グラフの目盛り・線の見た目（progress-graph__*）はグラフ画面の ChartCommon.css にあり、
// ホームから開いたときは読み込まれず日付が重なっていたため、ここでも読み込む
import './graphs/ChartCommon.css'
import './ACWRGaugeCard.css'
import type { ACWRResult } from '../types'
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
import { Modal } from './common/Modal'
import { ModalCloseButton } from './common/ModalCloseButton'

type WeeklyACWRDetailModalProps = {
  /** todayDateを終端とする直近28日分のDailyACWRPoint（Dashboard.tsx側で計算済みのものをそのまま渡す） */
  seriesPoints: DailyACWRPoint[]
  chronicDaysAvailable: number
  daysUntilAvailable: number
  /** 今日のACWRの内訳（急性・慢性負荷）。2026年11月6日、ホームのカードから詳細へ移した */
  result?: ACWRResult | null
  onClose: () => void
}

const ACWR_AXIS_MIN = 0
const ACWR_AXIS_RANGE = 2.0

// 2026年11月6日：ホームの疲労残高カードから開くようになったため、バッジの色をホームのカードの状態の色
// （ACWRGaugeCard の STATUS_META：最適＝good、注意＝warning、警戒＝danger、低下＝data）にそろえる。
// 今日の判定（result）が渡されたときは result.status の色を使い、無いときだけ下の5段階の色を使う。
// 文字も同じ判定から出す（色と文字で別の判定を使うと、筋肉の張りで「注意」になった日に「最適」の文字へ注意の色が付くため）
const STATUS_BADGE: Record<ACWRResult['status'], { tone: string; label: string }> = {
  sweet_spot: { tone: 'good', label: '🟢 最適' },
  warning: { tone: 'warning', label: '🟡 注意' },
  danger: { tone: 'danger', label: '🔴 警戒' },
  unload: { tone: 'data', label: '🔵 低下' },
}

// ACWRの値だけで決まる5段階が、今日の判定（筋肉の張りも加味した4段階）のどれに当たるか。
// 2つが食い違う日（張りで判定が上がった日など）は、説明文もホームのカードと同じ result.message を出す。
const TIER_TO_STATUS: Record<ACWRInsightTier, ACWRResult['status']> = {
  unload: 'unload',
  recovery: 'sweet_spot',
  optimal: 'sweet_spot',
  surge: 'warning',
  spike: 'danger',
}

const TIER_TONE: Record<ACWRInsightTier, string> = {
  unload: 'data',
  recovery: 'good',
  optimal: 'accent',
  surge: 'warning',
  spike: 'danger',
}

function LoadBreakdown({ result }: { result: ACWRResult }) {
  const maxBarLoad = Math.max(result.acuteLoad, result.chronicLoad, 1)
  return (
    <div className="acwr-card__bars">
      <div className="acwr-bar">
        <span className="acwr-bar__label">急性負荷（{result.acuteDays}日平均）</span>
        <div className="acwr-bar__track">
          <div className="acwr-bar__fill acwr-bar__fill--acute" style={{ width: `${Math.min(100, (result.acuteLoad / maxBarLoad) * 100)}%` }} />
        </div>
        <span className="acwr-bar__value metric-value">{result.acuteLoad.toFixed(0)}</span>
      </div>
      <div className="acwr-bar">
        <span className="acwr-bar__label">慢性負荷（{result.chronicDays}日平均）</span>
        <div className="acwr-bar__track">
          <div className="acwr-bar__fill acwr-bar__fill--chronic" style={{ width: `${Math.min(100, (result.chronicLoad / maxBarLoad) * 100)}%` }} />
        </div>
        <span className="acwr-bar__value metric-value">{result.chronicLoad.toFixed(0)}</span>
      </div>
    </div>
  )
}

export function WeeklyACWRDetailModal({ seriesPoints, chronicDaysAvailable, daysUntilAvailable, result, onClose }: WeeklyACWRDetailModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // アプリ利用開始直後はseries先頭側の日がまだ7日分のデータに満たずnullになりうる
  // （calculateDailyACWRSeriesの仕様）。折れ線は実際に値がある日のみで描画する
  // （WeightChart等が「記録がある日のみ」の疎な配列を使う既存パターンと同じ判断）。
  const availablePoints = seriesPoints.filter((point) => point.acwr != null) as { date: string; acwr: number }[]

  if (availablePoints.length === 0) {
    return (
      <Modal ariaLabel="週次ACWRトレンド" maxWidth={560} onOverlayClick={onClose} className="weekly-acwr-detail">
        <div className="weekly-acwr-detail__header">
          <h3>週次ACWRトレンド</h3>
          <ModalCloseButton onClick={onClose} />
        </div>
        <div className="weekly-acwr-detail__body">
          <p className="weekly-acwr-detail__pending">
            データ蓄積中（{Math.max(0, 7 - daysUntilAvailable)}/7日）。ACWRの算出には最低7日分の記録が必要です。
          </p>
        </div>
      </Modal>
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
    <Modal ariaLabel="週次ACWRトレンド" maxWidth={560} onOverlayClick={onClose} className="weekly-acwr-detail">
      <div className="weekly-acwr-detail__header">
        <h3>週次ACWRトレンド</h3>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div className="weekly-acwr-detail__body">
        <div className="weekly-acwr-detail__score-row">
          <span className="weekly-acwr-detail__score metric-value">{latest.acwr.toFixed(2)}</span>
          {result ? (
            <span className={`weekly-acwr-detail__badge weekly-acwr-detail__badge--${STATUS_BADGE[result.status].tone}`}>
              {STATUS_BADGE[result.status].label}
            </span>
          ) : (
            <span className={`weekly-acwr-detail__badge weekly-acwr-detail__badge--${TIER_TONE[insight.tier]}`}>{insight.title}</span>
          )}
        </div>

        {chronicDaysAvailable < 28 ? (
          <p className="weekly-acwr-detail__note">直近{chronicDaysAvailable}日分のデータで算出</p>
        ) : null}

        {result ? <LoadBreakdown result={result} /> : null}

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

        <p className="weekly-acwr-detail__insight-body">
          {result && TIER_TO_STATUS[insight.tier] !== result.status ? result.message : insight.body}
        </p>
      </div>
    </Modal>
  )
}
