import { useMemo, useState } from 'react'
import type { FoodItem } from '../../types'

const UNCATEGORIZED = 'uncategorized'
const DEFAULT_FOOD_EMOJI = '🍽️'

type GenreFoodPickerProps = {
  foodItems: FoodItem[]
  onSelect: (foodItemId: string) => void
}

export function GenreFoodPicker({ foodItems, onSelect }: GenreFoodPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState('')

  const foodCategories = useMemo(
    () =>
      Array.from(new Set(foodItems.map((item) => item.category).filter((category): category is string => Boolean(category)))).sort(
        (a, b) => a.localeCompare(b, 'ja'),
      ),
    [foodItems],
  )

  const categoryFilteredFoodItems = useMemo(() => {
    if (!selectedCategory) {
      return []
    }
    if (selectedCategory === UNCATEGORIZED) {
      return foodItems.filter((item) => !item.category)
    }
    return foodItems.filter((item) => item.category === selectedCategory)
  }, [foodItems, selectedCategory])

  return (
    <>
      <div className="calendar-detail__field calendar-detail__field--full">
        <span>食材のジャンルを選択</span>
        <div className="calendar-detail__category-filter">
          {foodCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={`calendar-detail__category-chip${
                selectedCategory === category ? ' calendar-detail__category-chip--active' : ''
              }`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            className={`calendar-detail__category-chip${
              selectedCategory === UNCATEGORIZED ? ' calendar-detail__category-chip--active' : ''
            }`}
            onClick={() => setSelectedCategory(UNCATEGORIZED)}
          >
            その他 / 未分類
          </button>
        </div>
      </div>

      {selectedCategory ? (
        <div className="calendar-detail__field calendar-detail__field--full">
          <span>食材を追加</span>
          <select
            key={selectedCategory}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                onSelect(event.target.value)
              }
            }}
          >
            <option value="">選択してください</option>
            {categoryFilteredFoodItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name} ({item.servingAmount}
                {item.servingUnit} = {item.calories}kcal)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="calendar-detail__description">上のジャンルを選択すると、食材の候補が表示されます</p>
      )}
    </>
  )
}
