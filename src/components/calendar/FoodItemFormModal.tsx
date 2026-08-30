import { useEffect, useState } from 'react'
import { createFoodItem } from '../../api/foodItems'
import { findMostSimilarName } from '../../utils/nameMatching'
import { useToast } from '../../hooks/useToast'
import type { FoodItem } from '../../types'
import './FoodItemFormModal.css'

// 食事編集モーダルの再構成（2026年8月30日）：MealLogEditModal.tsx内に常時展開で
// 表示されていた「新しい食材をここで登録」8項目のサブフォームを、
// DishFormModal.tsxと全く同じパターン（別モーダル・オーバーレイ＋ヘッダー＋
// 本体＋フッター）で分離した。DishFormModal.tsxとの違いは、食材名の類似度確認
// （findMostSimilarName、実装指示書v2 Phase C由来）を持つ点のみ。
//
// DishFormModal.tsxのonSavedはfetchDishesWithDetails()を呼ぶだけで、作成した
// 料理を自動的にmeal_logへ追加しない（ユーザーが改めてドロップダウンから選択し
// 「この内容で追加」を押す）。このモーダルも同じ設計とし、登録した食材を
// 自動的に食事記録へ追加することはしない（1画面で完結させず、登録→
// GenreFoodPickerで選び直す、という画面遷移を挟む方針。実装指示書の判断）。

const DEFAULT_FOOD_EMOJI = '🍽️'

const QUICK_FOOD_EMOJIS: { emoji: string; label: string }[] = [
  { emoji: '🍚', label: '主食' },
  { emoji: '🥩', label: '肉' },
  { emoji: '🥦', label: '野菜' },
  { emoji: '🍞', label: 'パン' },
  { emoji: '🍜', label: '麺' },
  { emoji: '🍎', label: '果物' },
  { emoji: '🥛', label: '乳製品' },
  { emoji: '🍽️', label: 'その他' },
]

type NewFoodForm = {
  name: string
  servingAmount: string
  servingUnit: string
  calories: string
  protein: string
  fat: string
  carbohydrates: string
  category: string
  emoji: string
}

const createEmptyNewFoodForm = (): NewFoodForm => ({
  name: '',
  servingAmount: '100',
  servingUnit: 'g',
  calories: '',
  protein: '',
  fat: '',
  carbohydrates: '',
  category: '',
  emoji: '',
})

type FoodItemFormErrors = {
  name?: string
  servingAmount?: string
  calories?: string
}

type FoodItemFormModalProps = {
  isOpen: boolean
  onClose: () => void
  /** 登録成功後に呼ばれる。DishFormModal.tsxのonSavedと同じく、呼び出し元は
   * ここでfetchFoodItems()を再実行してから閉じる想定（このモーダル自身は
   * 作成した食材を自動的に食事記録へ追加しない）。 */
  onSaved: () => void
  foodItems: FoodItem[]
}

export function FoodItemFormModal({ isOpen, onClose, onSaved, foodItems }: FoodItemFormModalProps) {
  const { showToast } = useToast()
  const [newFood, setNewFood] = useState<NewFoodForm>(createEmptyNewFoodForm())
  const [duplicateFoodSuggestion, setDuplicateFoodSuggestion] = useState<{ name: string } | null>(null)
  const [errors, setErrors] = useState<FoodItemFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setNewFood(createEmptyNewFoodForm())
      setDuplicateFoodSuggestion(null)
      setErrors({})
      setIsSaving(false)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleFieldChange = (field: keyof NewFoodForm, value: string) => {
    if (field === 'name') {
      setDuplicateFoodSuggestion(null)
    }
    setNewFood((current) => ({ ...current, [field]: value }))
  }

  const performCreate = async () => {
    const name = newFood.name.trim()
    const servingAmount = Number(newFood.servingAmount)
    const servingUnit = newFood.servingUnit.trim()
    const calories = Number(newFood.calories)
    const protein = Number(newFood.protein)
    const fat = Number(newFood.fat)
    const carbohydrates = Number(newFood.carbohydrates)

    setIsSaving(true)
    try {
      await createFoodItem({
        name,
        servingAmount,
        servingUnit,
        calories,
        protein,
        fat,
        carbohydrates,
        category: newFood.category.trim() || undefined,
        emoji: newFood.emoji.trim() || undefined,
      })
      showToast('食材を登録しました', 'success')
      onSaved()
    } catch (error) {
      console.error('Supabaseへの食材登録に失敗しました', error)
      setErrors((current) => ({ ...current, name: '食材の登録に失敗しました' }))
      showToast('食材の登録に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async () => {
    setErrors({})
    const name = newFood.name.trim()
    const servingAmount = Number(newFood.servingAmount)
    const servingUnit = newFood.servingUnit.trim()
    const calories = Number(newFood.calories)
    const protein = Number(newFood.protein)
    const fat = Number(newFood.fat)
    const carbohydrates = Number(newFood.carbohydrates)

    if (!name) {
      setErrors((current) => ({ ...current, name: '食材名は必須です' }))
      return
    }
    if (!Number.isFinite(servingAmount) || servingAmount <= 0 || !servingUnit) {
      setErrors((current) => ({ ...current, servingAmount: '基準量は0より大きい数値、単位は必須です' }))
      return
    }
    if (![calories, protein, fat, carbohydrates].every((value) => Number.isFinite(value) && value >= 0)) {
      setErrors((current) => ({ ...current, calories: 'カロリー・PFCは0以上の数値で入力してください' }))
      return
    }

    const similarMatch = findMostSimilarName(foodItems, name)
    if (similarMatch) {
      setDuplicateFoodSuggestion({ name: similarMatch.item.name })
      return
    }

    await performCreate()
  }

  const handleUseSimilarFoodItem = () => {
    // DishFormModal.tsxと同じ設計：このモーダルは食材マスタの新規作成のみを
    // 担当し、食事記録への追加は行わない。「いいえ」は「新規登録しない」の
    // 意味なので、そのまま閉じる（既存食材は呼び出し元のGenreFoodPickerで
    // 改めて検索して選択する）。
    setDuplicateFoodSuggestion(null)
    onClose()
  }

  return (
    <div className="food-item-form-modal__overlay" role="presentation" onClick={onClose}>
      <div
        className="food-item-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label="新しい食材を登録"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="food-item-form-modal__header">
          <h3>新しい食材を登録</h3>
          <button type="button" className="food-item-form-modal__close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="food-item-form-modal__body">
          <label className="calendar-detail__field">
            <span>食材名</span>
            <input
              type="text"
              value={newFood.name}
              onChange={(event) => handleFieldChange('name', event.target.value)}
              placeholder="例: ゆで卵"
            />
            {errors.name ? <p className="calendar-detail__error">{errors.name}</p> : null}
          </label>
          <label className="calendar-detail__field">
            <span>絵文字（任意）</span>
            <input
              type="text"
              value={newFood.emoji}
              onChange={(event) => handleFieldChange('emoji', event.target.value)}
              maxLength={4}
              placeholder={DEFAULT_FOOD_EMOJI}
            />
          </label>
          <div className="calendar-detail__inline-fields">
            {QUICK_FOOD_EMOJIS.map(({ emoji, label }) => (
              <button
                key={emoji}
                type="button"
                className="calendar-detail__secondary-button"
                title={label}
                onClick={() => handleFieldChange('emoji', emoji)}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
          <label className="calendar-detail__field">
            <span>カテゴリ（任意）</span>
            <input
              type="text"
              value={newFood.category}
              onChange={(event) => handleFieldChange('category', event.target.value)}
              placeholder="例: 主食 / 主菜 / 副菜 / 果物"
            />
          </label>
          <div className="calendar-detail__inline-fields">
            <label className="calendar-detail__field">
              <span>基準量</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={newFood.servingAmount}
                onChange={(event) => handleFieldChange('servingAmount', event.target.value)}
                placeholder="100"
              />
            </label>
            <label className="calendar-detail__field">
              <span>単位</span>
              <input
                type="text"
                value={newFood.servingUnit}
                onChange={(event) => handleFieldChange('servingUnit', event.target.value)}
                placeholder="g / 個 / 食分 など"
              />
            </label>
          </div>
          {errors.servingAmount ? <p className="calendar-detail__error">{errors.servingAmount}</p> : null}
          <p className="calendar-detail__description">
            下のカロリー・PFCは「基準量あたり」の値を入力してください（例: 卵1個なら基準量1・単位「個」）
          </p>
          <div className="calendar-detail__inline-fields">
            <label className="calendar-detail__field">
              <span>カロリー (kcal)</span>
              <input type="number" min="0" value={newFood.calories} onChange={(event) => handleFieldChange('calories', event.target.value)} />
            </label>
            <label className="calendar-detail__field">
              <span>タンパク質 (g)</span>
              <input type="number" min="0" value={newFood.protein} onChange={(event) => handleFieldChange('protein', event.target.value)} />
            </label>
          </div>
          <div className="calendar-detail__inline-fields">
            <label className="calendar-detail__field">
              <span>脂質 (g)</span>
              <input type="number" min="0" value={newFood.fat} onChange={(event) => handleFieldChange('fat', event.target.value)} />
            </label>
            <label className="calendar-detail__field">
              <span>炭水化物 (g)</span>
              <input
                type="number"
                min="0"
                value={newFood.carbohydrates}
                onChange={(event) => handleFieldChange('carbohydrates', event.target.value)}
              />
            </label>
          </div>
          {errors.calories ? <p className="calendar-detail__error">{errors.calories}</p> : null}
        </div>

        <div className="food-item-form-modal__footer">
          {duplicateFoodSuggestion ? (
            <div className="calendar-detail__warning">
              「{newFood.name.trim()}」という類似の食材「{duplicateFoodSuggestion.name}」が既に存在します。それでも新規登録しますか？
              <div className="calendar-detail__inline-fields">
                <button type="button" className="calendar-detail__secondary-button" onClick={performCreate}>
                  はい（新規登録する）
                </button>
                <button type="button" className="calendar-detail__secondary-button" onClick={handleUseSimilarFoodItem}>
                  いいえ（「{duplicateFoodSuggestion.name}」を使う）
                </button>
              </div>
            </div>
          ) : (
            <div className="calendar-detail__actions">
              <button type="button" className="calendar-detail__button" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? '登録中...' : 'この食材を登録する'}
              </button>
              <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
                キャンセル
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
