import { useMemo, useState } from 'react'
import { deleteFoodItem } from '../../api/foodItems'
import { useConfirm } from '../../hooks/useConfirm'
import { useToast } from '../../hooks/useToast'
import type { FoodItem } from '../../types'
import { UNCATEGORIZED_CHIP_LABEL } from '../../utils/foodCategoryHelpers'
import { filterFoodItems, listFoodCategories, UNCATEGORIZED_FOOD_FILTER } from '../../utils/mealFormHelpers'
import { SwipeableRow } from '../common/SwipeableRow'
import './MealForm.css'

// 記録画面ブラッシュアップ（2026年11月1日）：食事記録の食材選択。
// 従来の GenreFoodPicker（検索結果チップ＋ジャンル→プルダウン＋削除用プルダウン）を、
// トレーニングの種目選択と同じ「検索欄＋ジャンルチップ＋タップで追加する一覧」にした。
// 食材の削除は一覧の行を左スワイプ（確認ダイアログは従来どおり）。
// GenreFoodPicker 自体は料理の作成画面（DishFormModal）で引き続き使用している。

const DEFAULT_FOOD_EMOJI = '🍽️'

type FoodSelectorProps = {
  foodItems: FoodItem[]
  onSelect: (foodItemId: string) => void
  onFoodItemDeleted: () => void
  onRequestCreate: () => void
}

export function FoodSelector({ foodItems, onSelect, onFoodItemDeleted, onRequestCreate }: FoodSelectorProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const categories = useMemo(() => listFoodCategories(foodItems), [foodItems])
  const results = useMemo(() => filterFoodItems(foodItems, { query, category }), [foodItems, query, category])
  const hasFilter = query.trim() !== '' || category !== ''

  const handleDelete = async (item: FoodItem) => {
    if (!item.id) {
      return
    }
    const confirmed = await confirm(`「${item.name}」を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }
    try {
      await deleteFoodItem(item.id)
      onFoodItemDeleted()
      showToast('食材を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食材削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    }
  }

  return (
    <div className="meal-picker">
      <input
        type="search"
        className="meal-picker__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="食材を検索（例: 鶏むね）"
        aria-label="食材を検索"
      />
      <div className="meal-picker__chips" role="group" aria-label="ジャンルで絞り込む">
        {[...categories, UNCATEGORIZED_FOOD_FILTER].map((option) => (
          <button
            key={option}
            type="button"
            className={`calendar-detail__category-chip${category === option ? ' calendar-detail__category-chip--active' : ''}`}
            aria-pressed={category === option}
            onClick={() => setCategory((current) => (current === option ? '' : option))}
          >
            {option === UNCATEGORIZED_FOOD_FILTER ? UNCATEGORIZED_CHIP_LABEL : option}
          </button>
        ))}
      </div>

      {results.length > 0 ? (
        <ul className="meal-picker__list">
          {results.map((item) => (
            <li key={item.id}>
              <SwipeableRow actions={[{ key: 'delete', label: '削除', tone: 'danger', onClick: () => void handleDelete(item) }]}>
                <button type="button" className="meal-picker__item" onClick={() => item.id && onSelect(item.id)}>
                  <span className="meal-picker__item-name">
                    {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name}
                  </span>
                  <span className="meal-picker__item-meta">
                    {item.servingAmount}
                    {item.servingUnit}・{Math.round(item.calories)}kcal
                  </span>
                </button>
              </SwipeableRow>
            </li>
          ))}
        </ul>
      ) : hasFilter ? (
        <p className="meal-picker__empty">一致する食材が見つかりません</p>
      ) : (
        <p className="meal-picker__empty">検索するか、ジャンルを選ぶと候補が表示されます</p>
      )}

      <div className="meal-picker__footer">
        <button type="button" className="meal-picker__link" onClick={onRequestCreate}>
          ＋新しい食材を登録
        </button>
        {results.length > 0 ? <span className="meal-picker__hint">← スワイプで食材を削除</span> : null}
      </div>
    </div>
  )
}
