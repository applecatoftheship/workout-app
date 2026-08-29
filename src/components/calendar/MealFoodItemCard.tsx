import type { FoodItem } from '../../types'

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）
// 1食品明細分のカード。トレーニングのTrainingSetCard.tsxと異なり、食品は本質的に
// 異種の集まりのため「一括/詳細モード」の対象ではなく、常にこのカードのリストとして
// 表示する（詳細はMealLogEditModal.tsxのコメント参照）。

const DEFAULT_FOOD_EMOJI = '🍽️'

export type MealFoodItemCardValue = {
  key: string
  foodItemId: string
  amount: string
}

type MealFoodItemCardProps = {
  value: MealFoodItemCardValue
  foodItem: FoodItem | undefined
  /** 空欄時にinputのplaceholderへ表示する値。前回の実測量があればそちら、
   * なければ食品マスタの基準量（servingAmount）を呼び出し元が解決して渡す。 */
  placeholder: string
  error?: string
  onAmountChange: (value: string) => void
  onDelete: () => void
}

export function MealFoodItemCard({ value, foodItem, placeholder, error, onAmountChange, onDelete }: MealFoodItemCardProps) {
  return (
    <div className="meal-food-item-card">
      <div className="meal-food-item-card__head">
        <span>
          {foodItem?.emoji ?? DEFAULT_FOOD_EMOJI} {foodItem?.name ?? '不明な食材'}
          {foodItem?.category ? (
            <>
              {' '}
              <span className="calendar-detail__badge">{foodItem.category}</span>
            </>
          ) : null}
        </span>
        <button type="button" className="calendar-detail__delete-button" onClick={onDelete}>
          削除
        </button>
      </div>
      <label className="calendar-detail__field">
        <span>摂取量（基準: {foodItem ? `${foodItem.servingAmount}${foodItem.servingUnit}` : '-'} / 空欄なら下の値のまま）</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={value.amount}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder={placeholder}
        />
        {error ? <p className="calendar-detail__error">{error}</p> : null}
      </label>
    </div>
  )
}
