import './ACWRGaugeCard.css'
import type { ACWRResult, MuscleLocation, SorenessLevel } from '../types'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from '../utils/acwrHelpers'

type ACWRGaugeCardProps = {
  result: ACWRResult | null
  daysUntilAvailable: number
  sorenessLocation?: MuscleLocation
  sorenessLevel?: SorenessLevel
  /** 3日連続で🔴警戒状態が続いているか（実装指示書Phase C、2026年8月18日追加） */
  showDeloadWarning?: boolean
}

const STATUS_META: Record<ACWRResult['status'], { emoji: string; label: string; tone: string }> = {
  sweet_spot: { emoji: '🟢', label: '最適', tone: 'good' },
  warning: { emoji: '🟡', label: '注意', tone: 'warning' },
  danger: { emoji: '🔴', label: '警戒', tone: 'danger' },
  unload: { emoji: '🔵', label: '低下', tone: 'data' },
}

export function ACWRGaugeCard({ result, daysUntilAvailable, sorenessLocation, sorenessLevel, showDeloadWarning }: ACWRGaugeCardProps) {
  if (!result) {
    return (
      <section className="panel-card acwr-card">
        <h2 className="panel-card__title">疲労残高（ACWR）</h2>
        <p className="acwr-card__pending">
          データ蓄積中（あと{daysUntilAvailable}日で表示されます）
        </p>
      </section>
    )
  }

  const meta = STATUS_META[result.status]
  const maxBarLoad = Math.max(result.acuteLoad, result.chronicLoad, 1)

  return (
    <section className="panel-card acwr-card">
      <div className="acwr-card__header">
        <h2 className="panel-card__title">疲労残高（ACWR）</h2>
        <span className={`acwr-badge acwr-badge--${meta.tone}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>

      <div className="acwr-card__score">
        <span className="acwr-card__score-value metric-value">{result.acwr.toFixed(2)}</span>
        <span className="acwr-card__score-label">急性:慢性負荷比</span>
      </div>

      <div className="acwr-card__bars">
        <div className="acwr-bar">
          <span className="acwr-bar__label">急性負荷（{result.acuteDays}日平均）</span>
          <div className="acwr-bar__track">
            <div
              className="acwr-bar__fill acwr-bar__fill--acute"
              style={{ width: `${Math.min(100, (result.acuteLoad / maxBarLoad) * 100)}%` }}
            />
          </div>
          <span className="acwr-bar__value metric-value">{result.acuteLoad.toFixed(0)}</span>
        </div>
        <div className="acwr-bar">
          <span className="acwr-bar__label">慢性負荷（{result.chronicDays}日平均）</span>
          <div className="acwr-bar__track">
            <div
              className="acwr-bar__fill acwr-bar__fill--chronic"
              style={{ width: `${Math.min(100, (result.chronicLoad / maxBarLoad) * 100)}%` }}
            />
          </div>
          <span className="acwr-bar__value metric-value">{result.chronicLoad.toFixed(0)}</span>
        </div>
      </div>

      {showDeloadWarning ? (
        <p className="acwr-card__deload-warning">
          ⚠️ 3日連続で高負荷状態が続いています。ディロード（負荷を20〜30%程度落とす）を検討してください
        </p>
      ) : null}

      {result.hasSorenessWarning && sorenessLocation && sorenessLocation !== 'none' ? (
        <span className="acwr-soreness-tag">
          ⚠️ {MUSCLE_LOCATION_LABELS[sorenessLocation]}：{sorenessLevel ? SORENESS_LEVEL_LABELS[sorenessLevel] : '張りあり'}
        </span>
      ) : result.hasSorenessWarning ? (
        <span className="acwr-soreness-tag">⚠️ 局所疲労あり</span>
      ) : null}

      <p className="acwr-card__message">{result.message}</p>
    </section>
  )
}
