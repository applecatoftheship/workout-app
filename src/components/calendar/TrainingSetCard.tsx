// トレーニング記録画面UI/UX刷新（種目カード＋編集モーダル分離、2026年8月28日）
// セット別詳細モードの1セット分カード。色分けは意味を持たせず、視認性のための
// 4色循環（training-set-card--0〜3）とする。

const COLOR_VARIANTS = 4

export type TrainingSetCardValue = {
  key: string
  reps: string
  weight: string
}

type TrainingSetCardProps = {
  index: number
  value: TrainingSetCardValue
  repsError?: string
  weightError?: string
  /** 前回値のゴースト表示（新規追加時のみ、なければ undefined）。 */
  repsPlaceholder?: string
  weightPlaceholder?: string
  onChange: (field: 'reps' | 'weight', value: string) => void
  onDelete: () => void
}

export function TrainingSetCard({
  index,
  value,
  repsError,
  weightError,
  repsPlaceholder,
  weightPlaceholder,
  onChange,
  onDelete,
}: TrainingSetCardProps) {
  return (
    <div className={`training-set-card training-set-card--${index % COLOR_VARIANTS}`}>
      <span className="training-set-card__index">{index + 1}</span>
      <label className="calendar-detail__field">
        <span>回数</span>
        <input
          type="number"
          min="1"
          value={value.reps}
          placeholder={repsPlaceholder || undefined}
          onChange={(event) => onChange('reps', event.target.value)}
        />
        {repsError ? <p className="calendar-detail__error">{repsError}</p> : null}
      </label>
      <label className="calendar-detail__field">
        <span>重量 (kg)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={value.weight}
          placeholder={weightPlaceholder || undefined}
          onChange={(event) => onChange('weight', event.target.value)}
        />
        {weightError ? <p className="calendar-detail__error">{weightError}</p> : null}
      </label>
      <button
        type="button"
        className="calendar-detail__delete-button training-set-card__delete"
        onClick={onDelete}
      >
        削除
      </button>
    </div>
  )
}
