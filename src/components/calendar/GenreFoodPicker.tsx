import { useMemo, useState } from 'react'
import type { FoodItem } from '../../types'
import { deleteFoodItem } from '../../api/foodItems'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'

const UNCATEGORIZED = 'uncategorized'
const DEFAULT_FOOD_EMOJI = '🍽️'

type GenreFoodPickerProps = {
  foodItems: FoodItem[]
  onSelect: (foodItemId: string) => void
  onFoodItemDeleted: () => void
}

export function GenreFoodPicker({ foodItems, onSelect, onFoodItemDeleted }: GenreFoodPickerProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedDeleteId, setSelectedDeleteId] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

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

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category)
    setSelectedDeleteId('')
  }

  const handleDeleteFoodItem = async () => {
    const target = categoryFilteredFoodItems.find((item) => item.id === selectedDeleteId)
    if (!target) {
      return
    }

    const confirmed = await confirm(`「${target.name}」を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteFoodItem(target.id as string)
      setSelectedDeleteId('')
      onFoodItemDeleted()
      showToast('食材を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食材削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

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
              onClick={() => handleSelectCategory(category)}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            className={`calendar-detail__category-chip${
              selectedCategory === UNCATEGORIZED ? ' calendar-detail__category-chip--active' : ''
            }`}
            onClick={() => handleSelectCategory(UNCATEGORIZED)}
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
      ) : null}

      {selectedCategory ? (
        <div className="calendar-detail__field calendar-detail__field--full">
          <span>削除する食材</span>
          <div className="calendar-detail__select-with-action">
            <select value={selectedDeleteId} onChange={(event) => setSelectedDeleteId(event.target.value)}>
              <option value="">選択してください</option>
              {categoryFilteredFoodItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="calendar-detail__delete-button"
              onClick={handleDeleteFoodItem}
              disabled={!selectedDeleteId || isDeleting}
            >
              {isDeleting ? '削除中...' : '削除'}
            </button>
          </div>
        </div>
      ) : (
        <p className="calendar-detail__description">上のジャンルを選択すると、食材の候補が表示されます</p>
      )}
    </>
  )
}
