type PRCelebrationCardProps = {
  exerciseName: string
  before: number
  after: number
}

// 記録更新演出機能（2026年8月21日）：Before→Afterの推定1RMを対比表示する
// リキャップカード。控えめな紙吹雪アニメーションはCSS側（.celebration-card__confetti）で実装。
export function PRCelebrationCard({ exerciseName, before, after }: PRCelebrationCardProps) {
  return (
    <div className="celebration-card celebration-card--pr">
      <div className="celebration-card__confetti" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="celebration-card__label">🏆 自己ベスト更新</p>
      <p className="celebration-card__exercise">{exerciseName}</p>
      <div className="celebration-card__compare">
        <div className="celebration-card__compare-item">
          <span className="celebration-card__compare-label">Before</span>
          <span className="celebration-card__compare-value metric-value">{before}kg</span>
        </div>
        <span className="celebration-card__arrow" aria-hidden="true">→</span>
        <div className="celebration-card__compare-item celebration-card__compare-item--after">
          <span className="celebration-card__compare-label">After</span>
          <span className="celebration-card__compare-value metric-value">{after}kg</span>
        </div>
      </div>
      <p className="celebration-card__hint">推定1RM</p>
    </div>
  )
}
