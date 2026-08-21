type StreakCelebrationCardProps = {
  days: number
}

// 記録更新演出機能（2026年8月21日）：円形メダルアイコン＋達成日数を表示するカード。
export function StreakCelebrationCard({ days }: StreakCelebrationCardProps) {
  return (
    <div className="celebration-card celebration-card--streak">
      <div className="celebration-card__medal" aria-hidden="true">
        🔥
      </div>
      <p className="celebration-card__label">連続記録達成</p>
      <p className="celebration-card__streak-days metric-value">
        {days}
        <span className="celebration-card__streak-unit">日</span>
      </p>
      <p className="celebration-card__hint">記録が続いています</p>
    </div>
  )
}
