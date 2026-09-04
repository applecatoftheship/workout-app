import { useEffect, useState } from 'react'
import { DISH_CATEGORIES } from '../../types'
import type { DishCategory, DishWithDetails, FoodItem } from '../../types'
import { createDish, updateDish } from '../../api/dishes'
import { formatDishAmountLabel, resolveDishItemUnit } from '../../utils/dishHelpers'
import { GenreFoodPicker } from './GenreFoodPicker'
import { useToast } from '../../hooks/useToast'
import './DishFormModal.css'

const DEFAULT_FOOD_EMOJI = '🍽️'

type DishItemForm = {
  key: string
  foodItemId: string
  amount: string
  // 料理レシピの単位不一致・再発防止（2026年9月4日）：unit はユーザーが編集できず、
  // 表示・保存時に常に「選択した食材の serving_unit」へ解決する
  // （resolveDishItemUnit）。ここに持つ値は、食材が見つからない場合の
  // フォールバック（新規は食材の serving_unit、編集は既存 dish_food_items.unit）。
  fallbackUnit: string
}

let itemKeyCounter = 0
function createItemKey() {
  itemKeyCounter += 1
  return `dish-item-${itemKeyCounter}`
}

// 料理マスタ大幅拡充（2026年9月3日）：
// - カテゴリ選択欄（DISH_CATEGORIES の8分類）と絵文字入力を追加。
// - editingDish を渡すと「料理を編集」モード（名前・カテゴリ・絵文字・構成食材を
//   既存値で初期化 → updateDish）。未指定なら従来どおり新規作成（createDish）。
type DishFormModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  foodItems: FoodItem[]
  onFoodItemDeleted: () => void
  /** 指定すると編集モードで開く。 */
  editingDish?: DishWithDetails | null
}

export function DishFormModal({ isOpen, onClose, onSaved, foodItems, onFoodItemDeleted, editingDish }: DishFormModalProps) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DishCategory | ''>('')
  const [emoji, setEmoji] = useState('')
  const [items, setItems] = useState<DishItemForm[]>([])
  const [pickerResetKey, setPickerResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isEditing = editingDish != null

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setCategory('')
      setEmoji('')
      setItems([])
      setError(null)
      setIsSaving(false)
      setPickerResetKey((key) => key + 1)
      return
    }
    // 開いたタイミングで、編集対象があればその値で、なければ空で初期化する。
    if (editingDish) {
      setName(editingDish.name)
      setCategory(editingDish.category ?? '')
      setEmoji(editingDish.emoji ?? '')
      setItems(
        editingDish.items.map((item) => ({
          key: createItemKey(),
          foodItemId: item.foodItemId,
          amount: String(item.amount),
          fallbackUnit: item.unit,
        })),
      )
    } else {
      setName('')
      setCategory('')
      setEmoji('')
      setItems([])
    }
    setError(null)
    setIsSaving(false)
    setPickerResetKey((key) => key + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingDish?.id])

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
      { key: createItemKey(), foodItemId, amount: String(foodItem.servingAmount), fallbackUnit: foodItem.servingUnit },
    ])
  }

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleAmountChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, amount: value } : item)))
  }

  // 選択した食材の serving_unit へ単位を固定する。食材が見つからない場合のみ
  // fallbackUnit（新規は食材の serving_unit、編集は既存 dish_food_items.unit）を使う。
  const unitForItem = (item: DishItemForm): string =>
    resolveDishItemUnit(
      foodItems.find((food) => food.id === item.foodItemId),
      item.fallbackUnit,
    )

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
    if (!category) {
      setError('カテゴリを選択してください')
      return
    }
    if (items.length === 0) {
      setError('少なくとも1つの食材を選択してください')
      return
    }
    for (const item of items) {
      const amountValue = Number(item.amount)
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setError('量は0より大きい数値で入力してください')
        return
      }
    }

    setError(null)
    setIsSaving(true)
    const dishInput = {
      name: trimmedName,
      category,
      emoji: emoji.trim() || undefined,
      // 単位は選択した食材の serving_unit に固定（ユーザーは編集不可）。
      items: items.map((item) => ({
        foodItemId: item.foodItemId,
        amount: Number(item.amount),
        unit: unitForItem(item),
      })),
    }
    try {
      if (isEditing && editingDish?.id) {
        await updateDish(editingDish.id, dishInput)
        showToast('料理を更新しました', 'success')
      } else {
        await createDish(dishInput)
        showToast('料理を登録しました', 'success')
      }
      onSaved()
    } catch (saveError) {
      console.error('Supabaseへの料理保存に失敗しました', saveError)
      setError('保存に失敗しました。もう一度お試しください')
      showToast(isEditing ? '料理の更新に失敗しました' : '料理の登録に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const heading = isEditing ? '料理を編集' : '新しい料理を作る'

  return (
    <div className="dish-form-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="dish-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dish-form-modal__header">
          <h3>{heading}</h3>
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

          <div className="calendar-detail__inline-fields">
            <label className="calendar-detail__field">
              <span>カテゴリ</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as DishCategory)}>
                <option value="">選択してください</option>
                {DISH_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="calendar-detail__field">
              <span>絵文字（任意）</span>
              <input
                type="text"
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                maxLength={4}
                placeholder={DEFAULT_FOOD_EMOJI}
              />
            </label>
          </div>

          <GenreFoodPicker key={pickerResetKey} foodItems={foodItems} onSelect={addItem} onFoodItemDeleted={onFoodItemDeleted} />

          {items.length > 0 ? (
            <div className="calendar-detail__log-list">
              {items.map((item) => {
                const foodItem = foodItems.find((food) => food.id === item.foodItemId)
                const unit = unitForItem(item)
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
                        <span>{formatDishAmountLabel(unit)}</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.amount}
                          onChange={(event) => handleAmountChange(item.key, event.target.value)}
                        />
                      </label>
                      <div className="calendar-detail__field">
                        <span>単位</span>
                        {/* 料理レシピの単位不一致・再発防止（2026年9月4日）：単位は
                            食材の基準単位（serving_unit）に固定。ユーザーは編集不可。 */}
                        <input type="text" value={unit} readOnly disabled aria-label="単位（食材の基準単位に固定）" />
                      </div>
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
              {isSaving
                ? isEditing
                  ? '更新中...'
                  : '登録中...'
                : isEditing
                  ? 'この内容で更新する'
                  : 'この料理を登録する'}
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
