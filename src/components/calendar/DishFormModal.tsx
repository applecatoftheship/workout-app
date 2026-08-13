import { useEffect, useState } from 'react'
import type { FoodItem } from '../../types'
import { createDish } from '../../api/dishes'
import { GenreFoodPicker } from './GenreFoodPicker'
import './DishFormModal.css'

const DEFAULT_FOOD_EMOJI = '🍽️'

type DishItemForm = {
  key: string
  foodItemId: string
  amount: string
  unit: string
}

let itemKeyCounter = 0
function createItemKey() {
  itemKeyCounter += 1
  return `dish-item-${itemKeyCounter}`
}

type DishFormModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  foodItems: FoodItem[]
  onFoodItemDeleted: () => void
}

export function DishFormModal({ isOpen, onClose, onSaved, foodItems, onFoodItemDeleted }: DishFormModalProps) {
  const [name, setName] = useState('')
  const [items, setItems] = useState<DishItemForm[]>([])
  const [pickerResetKey, setPickerResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setItems([])
      setError(null)
      setIsSaving(false)
      setPickerResetKey((key) => key + 1)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const addItem = (foodItemId: string) => {
    const foodItem = foodItems.find((item) => item.id === foodItemId)
    if (!foodItem) {
      return
    }
    setItems((current) => [
      ...current,
      { key: createItemKey(), foodItemId, amount: String(foodItem.servingAmount), unit: foodItem.servingUnit },
    ])
  }

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleAmountChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, amount: value } : item)))
  }

  const handleUnitChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, unit: value } : item)))
  }

  const previewTotals = items.reduce(
    (totals, item) => {
      const foodItem = foodItems.find((food) => food.id === item.foodItemId)
      if (!foodItem) {
        return totals
      }
      const amountValue = Number(item.amount)
      const ratio = Number.isFinite(amountValue) ? amountValue / foodItem.servingAmount : 0
      return {
        calories: totals.calories + foodItem.calories * ratio,
        protein: totals.protein + foodItem.protein * ratio,
        fat: totals.fat + foodItem.fat * ratio,
        carbohydrates: totals.carbohydrates + foodItem.carbohydrates * ratio,
      }
    },
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('料理名は必須です')
      return
    }
    if (items.length === 0) {
      setError('少なくとも1つの食材を選択してください')
      return
    }
    for (const item of items) {
      const amountValue = Number(item.amount)
      if (!Number.isFinite(amountValue) || amountValue <= 0 || !item.unit.trim()) {
        setError('量は0より大きい数値、単位は必須です')
        return
      }
    }

    setError(null)
    setIsSaving(true)
    try {
      await createDish(
        trimmedName,
        items.map((item) => ({ foodItemId: item.foodItemId, amount: Number(item.amount), unit: item.unit.trim() })),
      )
      onSaved()
    } catch (saveError) {
      console.error('Supabaseへの料理登録に失敗しました', saveError)
      setError('登録に失敗しました。もう一度お試しください')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dish-form-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="dish-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label="新しい料理を作る"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dish-form-modal__header">
          <h3>新しい料理を作る</h3>
          <button type="button" className="dish-form-modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="dish-form-modal__body">
          {error ? <p className="calendar-detail__form-error">{error}</p> : null}

          <label className="calendar-detail__field">
            <span>料理名</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 親子丼" />
          </label>

          <GenreFoodPicker key={pickerResetKey} foodItems={foodItems} onSelect={addItem} onFoodItemDeleted={onFoodItemDeleted} />

          {items.length > 0 ? (
            <div className="calendar-detail__log-list">
              {items.map((item) => {
                const foodItem = foodItems.find((food) => food.id === item.foodItemId)
                return (
                  <div key={item.key} className="calendar-detail__meal-item">
                    <div className="calendar-detail__meal-head">
                      <span>
                        {foodItem?.emoji ?? DEFAULT_FOOD_EMOJI} {foodItem?.name ?? '不明な食材'}
                      </span>
                      <button type="button" className="calendar-detail__delete-button" onClick={() => removeItem(item.key)}>
                        削除
                      </button>
                    </div>
                    <div className="calendar-detail__inline-fields">
                      <label className="calendar-detail__field">
                        <span>量</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.amount}
                          onChange={(event) => handleAmountChange(item.key, event.target.value)}
                        />
                      </label>
                      <label className="calendar-detail__field">
                        <span>単位</span>
                        <input type="text" value={item.unit} onChange={(event) => handleUnitChange(item.key, event.target.value)} />
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="calendar-detail__meal-totals">
            合計（倍率1.0あたり）: {Math.round(previewTotals.calories)}kcal / P{Math.round(previewTotals.protein)}g F
            {Math.round(previewTotals.fat)}g C{Math.round(previewTotals.carbohydrates)}g
          </div>
        </div>

        <div className="dish-form-modal__footer">
          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '登録中...' : 'この料理を登録する'}
            </button>
            <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
