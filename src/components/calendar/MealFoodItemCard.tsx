import type { FoodItem } from '../../types'
import './CalendarForms.css'
import './MealForm.css'

// 記録画面ブラッシュアップ（2026年11月1日）：食事記録で「選んだもの」の1行。
// 従来の「名前＋ジャンル表示＋削除ボタン／摂取量の入力欄（説明文つき）」のカードを、
// 「名前｜量の入力＋単位｜kcal｜×」の1行にまとめた（量の入力欄が空なら placeholder の量
// ＝前回の量か基準量で計算されるのは従来どおり）。

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
  // kcal 表示は保存時の計算と同じく「空欄＝基準量」で算出する（placeholder の前回量ではない）。
  const amountForKcal = value.amount.trim() === '' ? foodItem?.servingAmount ?? 0 : Number(value.amount)
  const kcal =
    foodItem && Number.isFinite(amountForKcal) && foodItem.servingAmount > 0
      ? Math.round((foodItem.calories * amountForKcal) / foodItem.servingAmount)
      : null
  const name = foodItem?.name ?? '不明な食材'

  return (
    <div className="meal-item-row">
      <span className="meal-item-row__name">
        {foodItem?.emoji ?? DEFAULT_FOOD_EMOJI} {name}
      </span>
      <label className="meal-item-row__amount">
        <input
          type="number"
          inputMode="decimal"
          min="0.1"
          step="0.1"
          value={value.amount}
          onChange={(event) => onAmountChange(event.target.value)}
          placeholder={placeholder}
          aria-label={`${name}の量（${foodItem?.servingUnit ?? ''}）`}
        />
        <span>{foodItem?.servingUnit ?? ''}</span>
      </label>
      <span className="meal-item-row__kcal">{kcal != null ? `${kcal}kcal` : '-'}</span>
      <button type="button" className="meal-item-row__remove" onClick={onDelete} aria-label={`${name}を外す`}>
        ×
      </button>
      {error ? <p className="calendar-detail__error meal-item-row__error">{error}</p> : null}
    </div>
  )
}
