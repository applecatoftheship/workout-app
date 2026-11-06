import './ACWRGaugeCard.css'
import './WeeklyACWRTrendCard.css'
import type { ACWRResult, MuscleLocation, SorenessLevel } from '../types'
import { MUSCLE_LOCATION_LABELS, SORENESS_LEVEL_LABELS } from '../utils/acwrHelpers'
import { TrackRing } from './TrackRing'
import { ChevronRightIcon } from './icons'
import { buildSparklinePath } from '../utils/sparkline'
import type { DailyACWRPoint } from '../utils/acwrHelpers'

type ACWRGaugeCardProps = {
  result: ACWRResult | null
  daysUntilAvailable: number
  sorenessLocation?: MuscleLocation
  sorenessLevel?: SorenessLevel
  /** 3日連続で🔴警戒状態が続いているか（実装指示書Phase C、2026年8月18日追加） */
  showDeloadWarning?: boolean
  /** 暫定値表示バグ対応（Phase 0.5、2026年9月17日）：ACWR計算に必要な
   * workouts/sportLogsのfetchが完了していない間はtrue。「データ蓄積中
   * （記録日数が7日未満）」と意味が異なるため、resultがnullでも
   * isLoadingがtrueの間は「データ蓄積中」メッセージではなく専用の
   * 読み込み中表示にする（既存の「読み込み中...」文言パターン、
   * TrainingTemplateManager.tsx等と同じ表記を踏襲）。 */
  isLoading?: boolean
  /** 直近7日分のACWR（ホームで推移の線を出す。2026年11月6日、週次トレンドのカードを統合） */
  trendPoints?: DailyACWRPoint[]
  /** カードを押したときに詳細（週次ACWRトレンド）を開く */
  onOpenDetail?: () => void
}

const STATUS_META: Record<ACWRResult['status'], { emoji: string; label: string; tone: string }> = {
  sweet_spot: { emoji: '🟢', label: '最適', tone: 'good' },
  warning: { emoji: '🟡', label: '注意', tone: 'warning' },
  danger: { emoji: '🔴', label: '警戒', tone: 'danger' },
  unload: { emoji: '🔵', label: '低下', tone: 'data' },
}

// スプラッシュ画面とのUI統一 v6（2026年8月28〜29日）：TrackRingの弧の色を
// 既存のacwr-badge--{tone}と同じトーンに合わせるためのCSS変数名マッピング。
const STATUS_RING_COLOR_VAR: Record<string, string> = {
  good: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  data: '--color-data',
}

export function ACWRGaugeCard({
  result,
  daysUntilAvailable,
  sorenessLocation,
  sorenessLevel,
  showDeloadWarning,
  isLoading,
  trendPoints,
  onOpenDetail,
}: ACWRGaugeCardProps) {
  if (isLoading) {
    return (
      <section className="panel-card acwr-card">
        <h2 className="panel-card__title">疲労残高（ACWR）</h2>
        <p className="panel-card__description">読み込み中...</p>
      </section>
    )
  }

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
  // 画面の整理（2026年11月6日）：ホームの「疲労残高」と「週次ACWRトレンド」の2枚を1枚にまとめた。
  // 急性・慢性負荷の内訳は詳細（WeeklyACWRDetailModal）へ移し、ホームには値・状態・直近7日の推移・ひとことだけを出す。
  // カード全体を押すと詳細を開く（NN/g「Cards」）。中の文字（警告など）を読み上げで聞けるよう、カード自体はボタンにせず、
  // 右端の「›」ボタンの押せる範囲をカード全体に広げている（.acwr-card__open::after）。
  // 推移の線の色は、バッジ・リングと同じ状態（result.status）の色にそろえる。
  const trendValues = (trendPoints ?? []).filter((point) => point.acwr != null).map((point) => point.acwr as number)
  const trendTone = meta.tone
  const { linePoints, areaPath } = buildSparklinePath(trendValues, 100, 28)

  return (
    <section className={`panel-card acwr-card ${onOpenDetail ? 'acwr-card--link' : ''}`}>
      <div className="acwr-card__header">
        <h2 className="panel-card__title">疲労残高（ACWR）</h2>
        <span className={`acwr-badge acwr-badge--${meta.tone}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>

      <div className="acwr-card__summary">
        <TrackRing value={Math.min(100, (result.acwr / 2) * 100)} size={56} strokeWidth={6} colorVar={STATUS_RING_COLOR_VAR[meta.tone]}>
          <span className="acwr-card__score-value metric-value reveal-fade">{result.acwr.toFixed(2)}</span>
        </TrackRing>
        {trendValues.length > 1 ? (
          <div className="acwr-card__trend">
            <svg viewBox="0 0 100 28" className="weekly-acwr-trend__sparkline" preserveAspectRatio="none" aria-hidden="true">
              <path d={areaPath} className={`weekly-acwr-trend__area weekly-acwr-trend__area--${trendTone}`} />
              <polyline points={linePoints} fill="none" className={`weekly-acwr-trend__line weekly-acwr-trend__line--${trendTone}`} />
            </svg>
            <span className="acwr-card__trend-label">直近7日の推移</span>
          </div>
        ) : null}
        {onOpenDetail ? (
          <button type="button" className="acwr-card__open" onClick={onOpenDetail} aria-label="疲労残高の推移と内訳を見る">
            <ChevronRightIcon className="acwr-card__chevron" strokeWidth={1.8} />
          </button>
        ) : null}
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
