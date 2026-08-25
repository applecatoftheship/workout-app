import './WeeklyACWRTrendCard.css'
import type { ACWRInsightTier, DailyACWRPoint } from '../utils/acwrHelpers'
import { getACWRInsight } from '../utils/acwrHelpers'
import { ChevronRightIcon } from './icons'

type WeeklyACWRTrendCardProps = {
  /** 直近7日分のDailyACWRPoint（Dashboard.tsx側で28日系列の末尾7件をスライスして渡す） */
  weekPoints: DailyACWRPoint[]
  daysUntilAvailable: number
  onOpenDetail: () => void
}

const TIER_TONE: Record<ACWRInsightTier, string> = {
  unload: 'warning',
  recovery: 'good',
  optimal: 'accent',
  surge: 'warning',
  spike: 'danger',
}

/** ミニスパークライン用の簡易SVG座標計算（メイングラフとは別に、控えめな高さのカード向けに専用実装） */
function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return { linePoints: '', areaPath: '' }
  }
  const min = Math.min(...values, 0.8)
  const max = Math.max(...values, 1.5)
  const range = max - min || 1

  const toXY = (value: number, index: number) => {
    const x = values.length <= 1 ? width / 2 : (width * index) / (values.length - 1)
    const y = height - ((value - min) / range) * height
    return [x, y] as const
  }

  const coords = values.map((value, index) => toXY(value, index))
  const linePoints = coords.map(([x, y]) => `${x},${y}`).join(' ')
  const areaPath = `M ${coords[0][0]},${height} L ${coords.map(([x, y]) => `${x},${y}`).join(' L ')} L ${coords[coords.length - 1][0]},${height} Z`

  return { linePoints, areaPath }
}

export function WeeklyACWRTrendCard({ weekPoints, daysUntilAvailable, onOpenDetail }: WeeklyACWRTrendCardProps) {
  const latestPoint = [...weekPoints].reverse().find((point) => point.acwr != null)

  if (!latestPoint) {
    return (
      <button type="button" className="panel-card weekly-acwr-trend weekly-acwr-trend--pending" onClick={onOpenDetail}>
        <h2 className="panel-card__title">週次ACWRトレンド</h2>
        <p className="weekly-acwr-trend__pending-text">
          データ蓄積中（{Math.max(0, 7 - daysUntilAvailable)}/7日）
        </p>
      </button>
    )
  }

  const insight = getACWRInsight(latestPoint.acwr as number)
  const values = weekPoints.filter((point) => point.acwr != null).map((point) => point.acwr as number)
  const { linePoints, areaPath } = buildSparklinePath(values, 100, 28)

  return (
    <button type="button" className="panel-card weekly-acwr-trend" onClick={onOpenDetail}>
      <div className="weekly-acwr-trend__header">
        <h2 className="panel-card__title">週次ACWRトレンド</h2>
        <ChevronRightIcon className="weekly-acwr-trend__chevron" strokeWidth={1.8} />
      </div>
      <div className="weekly-acwr-trend__body">
        <div className="weekly-acwr-trend__sparkline-wrap">
          <svg viewBox="0 0 100 28" className="weekly-acwr-trend__sparkline" preserveAspectRatio="none" aria-hidden="true">
            <path d={areaPath} className={`weekly-acwr-trend__area weekly-acwr-trend__area--${TIER_TONE[insight.tier]}`} />
            <polyline
              points={linePoints}
              fill="none"
              className={`weekly-acwr-trend__line weekly-acwr-trend__line--${TIER_TONE[insight.tier]}`}
            />
          </svg>
        </div>
        <div className="weekly-acwr-trend__meta">
          <span className="weekly-acwr-trend__score metric-value">{(latestPoint.acwr as number).toFixed(2)}</span>
          <span className={`weekly-acwr-trend__badge weekly-acwr-trend__badge--${TIER_TONE[insight.tier]}`}>{insight.title}</span>
        </div>
      </div>
    </button>
  )
}
