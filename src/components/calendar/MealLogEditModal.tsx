import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  fetchLatestFoodItemRecord,
  fetchMealLogItems,
  fetchMealLogs,
  upsertMealLog,
} from '../../api/mealLogs'
import type { MealLogInput } from '../../api/mealLogs'
import { createFoodItem, fetchFoodItems } from '../../api/foodItems'
import { deleteDish, fetchDishesWithDetails, fetchMealSizes } from '../../api/dishes'
import { getCurrentTimeHHMM, combineDateAndTimeToISO, extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import { findMostSimilarName } from '../../utils/nameMatching'
import { GenreFoodPicker } from './GenreFoodPicker'
import { DishFormModal } from './DishFormModal'
import { MealFoodItemCard } from './MealFoodItemCard'
import type { MealFoodItemCardValue } from './MealFoodItemCard'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import type { DateString, DishWithDetails, FoodItem, MealLog, MealSize, MealType } from '../../types'
import './MealLogEntry.css'

// 食事記録画面UI/UX刷新（meal_logエントリカード＋編集モーダル分離、2026年8月29日）：
// トレーニング側（TrainingExerciseEditModal.tsx）の「一括/詳細2モード・既存データの
// 均一性から自動判定」は、食事ドメインには字面通り移植しない（方針決定済み・案A）。
// セット（同一種目の繰り返し記録）と異なり、1回の食事に含まれる食品は本質的に
// 異種の集まりであり「同一値の繰り返しをN件→1件に畳む」均一性判定が意味を持たない。
// また「料理から選択」で追加した食品は保存時点でmeal_log_food_itemsへ個別食品として
// フラット展開され、dish_idは保存されないため、編集時に「これは元々どの料理だったか」
// をDBから再現する手段がない（今回はスキーマ変更なしの方針のため対応しない）。
// 代わりに、食品明細リストは常時表示の1種類のみとし、「一括入力」の速さは
// 新規追加時の「料理から選択」タブ（1回のタップで複数食品を追加できるショートカット）
// が担う形にした。「食材から選択」タブは1品ずつの「詳細入力」に相当する。
// このためトレーニングのtrainingSetHelpers.tsに相当する専用モジュールは新設していない。

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

let itemKeyCounter = 0
function createItemKey() {
  itemKeyCounter += 1
  return `meal-item-${itemKeyCounter}`
}

function resolveAmount(amount: string, foodItem: FoodItem | undefined): number {
  if (!foodItem) {
    return 0
  }
  return amount.trim() === '' ? foodItem.servingAmount : Number(amount)
}

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

type FormErrors = {
  mealType?: string
  items?: string
  newFoodName?: string
  newFoodServingAmount?: string
  newFoodCalories?: string
}

type MealLogEditModalProps = {
  mealLogs: MealLog[]
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  selectedDate: DateString
  /** 未指定の場合は新規エントリの追加。 */
  mealLogId?: string
  onClose: () => void
}

export function MealLogEditModal({ mealLogs, setMealLogs, selectedDate, mealLogId, onClose }: MealLogEditModalProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()

  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [mealType, setMealType] = useState<MealType | ''>('')
  const [mealTime, setMealTime] = useState(getCurrentTimeHHMM())
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<MealFoodItemCardValue[]>([])
  const [previousAmounts, setPreviousAmounts] = useState<Record<string, number | null>>({})
  const [inputMode, setInputMode] = useState<'food' | 'dish'>('food')
  const [dishes, setDishes] = useState<DishWithDetails[]>([])
  const [mealSizes, setMealSizes] = useState<MealSize[]>([])
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedMealSizeId, setSelectedMealSizeId] = useState('')
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [isDeletingDish, setIsDeletingDish] = useState(false)
  const [newFood, setNewFood] = useState<NewFoodForm>(createEmptyNewFoodForm())
  const [duplicateFoodSuggestion, setDuplicateFoodSuggestion] = useState<{ name: string } | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const requestedFoodIdsRef = useRef<Set<string>>(new Set())

  const loadFoodItems = () => {
    fetchFoodItems()
      .then(setFoodItems)
      .catch((error) => {
        console.error('Supabaseから食材一覧の取得に失敗しました', error)
      })
  }

  const loadDishes = () => {
    fetchDishesWithDetails()
      .then(setDishes)
      .catch((error) => {
        console.error('Supabaseから料理一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadFoodItems()
    loadDishes()
    fetchMealSizes()
      .then(setMealSizes)
      .catch((error) => {
        console.error('Supabaseからサイズ一覧の取得に失敗しました', error)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mealSizes.length > 0 && !selectedMealSizeId) {
      setSelectedMealSizeId(mealSizes[0].id as string)
    }
  }, [mealSizes, selectedMealSizeId])

  // 食材ごとの「前回の実測量」取得（新設、2026年8月29日）：同じ食材が複数回
  // 要求されても1回しか叩かないようrequestedFoodIdsRefでガードする。
  const ensurePreviousAmountLoaded = (foodItemId: string) => {
    if (requestedFoodIdsRef.current.has(foodItemId)) {
      return
    }
    requestedFoodIdsRef.current.add(foodItemId)
    fetchLatestFoodItemRecord(foodItemId, selectedDate)
      .then((record) => {
        setPreviousAmounts((current) => ({ ...current, [foodItemId]: record ? record.amount : null }))
      })
      .catch((error) => {
        console.error('Supabaseから食材の前回記録取得に失敗しました', error)
      })
  }

  // 既存エントリを編集する場合の初期値読み込み（マウント時の1回のみでよい）。
  useEffect(() => {
    if (!mealLogId) {
      return
    }
    const existing = mealLogs.find((log) => log.id === mealLogId)
    if (!existing) {
      return
    }

    setMealType(existing.mealType)
    setNotes(existing.notes ?? '')
    setMealTime(existing.mealTime ? extractTimeHHMMFromISO(existing.mealTime) : getCurrentTimeHHMM())

    fetchMealLogItems(mealLogId)
      .then((loadedItems) => {
        setItems(
          loadedItems.map((item) => {
            ensurePreviousAmountLoaded(item.foodItemId)
            return { key: createItemKey(), foodItemId: item.foodItemId, amount: String(item.amount) }
          }),
        )
      })
      .catch((error) => {
        console.error('Supabaseから食事記録の内訳取得に失敗しました', error)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFoodSelection = (foodItemId: string) => {
    if (!foodItemId) {
      return
    }
    ensurePreviousAmountLoaded(foodItemId)
    setItems((current) => [...current, { key: createItemKey(), foodItemId, amount: '' }])
  }

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleAmountChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, amount: value } : item)))
  }

  const selectedDish = dishes.find((dish) => dish.id === selectedDishId)
  const selectedMealSize = mealSizes.find((size) => size.id === selectedMealSizeId)
  const effectiveMultiplier = mealSizes.length > 0 ? selectedMealSize?.multiplier ?? 1 : 1

  const dishPreviewTotals = selectedDish
    ? {
        calories: selectedDish.totalCalories * effectiveMultiplier,
        protein: selectedDish.totalProtein * effectiveMultiplier,
        fat: selectedDish.totalFat * effectiveMultiplier,
        carbohydrates: selectedDish.totalCarbohydrates * effectiveMultiplier,
      }
    : null

  const handleAddDishToSelections = () => {
    if (!selectedDish) {
      return
    }
    const newItems = selectedDish.items
      .filter((item) => item.foodItem)
      .map((item) => {
        ensurePreviousAmountLoaded(item.foodItemId)
        return {
          key: createItemKey(),
          foodItemId: item.foodItemId,
          amount: String(Math.round(item.amount * effectiveMultiplier * 10) / 10),
        }
      })
    setItems((current) => [...current, ...newItems])
    setSelectedDishId('')
  }

  const handleDeleteDish = async () => {
    if (!selectedDish?.id) {
      return
    }
    const confirmed = await confirm(`「${selectedDish.name}」を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    setIsDeletingDish(true)
    try {
      await deleteDish(selectedDish.id)
      setSelectedDishId('')
      loadDishes()
      showToast('料理を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの料理削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsDeletingDish(false)
    }
  }

  const handleNewFoodFieldChange = (field: keyof NewFoodForm, value: string) => {
    if (field === 'name') {
      setDuplicateFoodSuggestion(null)
    }
    setNewFood((current) => ({ ...current, [field]: value }))
  }

  const performCreateFoodItem = async () => {
    const name = newFood.name.trim()
    const servingAmount = Number(newFood.servingAmount)
    const servingUnit = newFood.servingUnit.trim()
    const calories = Number(newFood.calories)
    const protein = Number(newFood.protein)
    const fat = Number(newFood.fat)
    const carbohydrates = Number(newFood.carbohydrates)

    try {
      const created = await createFoodItem({
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
      setFoodItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      if (created.id) {
        ensurePreviousAmountLoaded(created.id)
        setItems((current) => [...current, { key: createItemKey(), foodItemId: created.id as string, amount: '' }])
      }
      setNewFood(createEmptyNewFoodForm())
      setErrors((current) => ({ ...current, newFoodName: undefined, newFoodServingAmount: undefined, newFoodCalories: undefined }))
      setDuplicateFoodSuggestion(null)
      showToast('食材を登録しました', 'success')
    } catch (error) {
      console.error('Supabaseへの食材登録に失敗しました', error)
      setErrors((current) => ({ ...current, newFoodName: '食材の登録に失敗しました' }))
      showToast('食材の登録に失敗しました', 'error')
    }
  }

  const handleAddNewFoodItem = async () => {
    const name = newFood.name.trim()
    const servingAmount = Number(newFood.servingAmount)
    const servingUnit = newFood.servingUnit.trim()
    const calories = Number(newFood.calories)
    const protein = Number(newFood.protein)
    const fat = Number(newFood.fat)
    const carbohydrates = Number(newFood.carbohydrates)

    if (!name) {
      setErrors((current) => ({ ...current, newFoodName: '食材名は必須です' }))
      return
    }
    if (!Number.isFinite(servingAmount) || servingAmount <= 0 || !servingUnit) {
      setErrors((current) => ({ ...current, newFoodServingAmount: '基準量は0より大きい数値、単位は必須です' }))
      return
    }
    if (![calories, protein, fat, carbohydrates].every((value) => Number.isFinite(value) && value >= 0)) {
      setErrors((current) => ({ ...current, newFoodCalories: 'カロリー・PFCは0以上の数値で入力してください' }))
      return
    }

    const similarMatch = findMostSimilarName(foodItems, name)
    if (similarMatch) {
      setDuplicateFoodSuggestion({ name: similarMatch.item.name })
      return
    }

    await performCreateFoodItem()
  }

  const handleUseSimilarFoodItem = () => {
    const similarMatch = findMostSimilarName(foodItems, newFood.name.trim())
    if (!similarMatch || !similarMatch.item.id) {
      return
    }
    setDuplicateFoodSuggestion(null)
    ensurePreviousAmountLoaded(similarMatch.item.id)
    setItems((current) => [...current, { key: createItemKey(), foodItemId: similarMatch.item.id as string, amount: '' }])
    setNewFood(createEmptyNewFoodForm())
  }

  const previewTotals = items.reduce(
    (totals, item) => {
      const foodItem = foodItems.find((candidate) => candidate.id === item.foodItemId)
      if (!foodItem) {
        return totals
      }
      const amountValue = resolveAmount(item.amount, foodItem)
      const ratio = Number.isFinite(amountValue) ? amountValue / foodItem.servingAmount : 1
      return {
        calories: totals.calories + foodItem.calories * ratio,
        protein: totals.protein + foodItem.protein * ratio,
        fat: totals.fat + foodItem.fat * ratio,
        carbohydrates: totals.carbohydrates + foodItem.carbohydrates * ratio,
      }
    },
    { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
  )

  const validate = (): boolean => {
    const next: FormErrors = {}

    if (!mealType) {
      next.mealType = '食事タイプは必須です'
    }
    if (items.length === 0) {
      next.items = '少なくとも1つの食材を選択してください'
    }
    for (const item of items) {
      if (item.amount.trim() !== '') {
        const amountValue = Number(item.amount)
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          next.items = '摂取量は0より大きい数値で入力してください'
        }
      }
    }

    setErrors(next)
    const hasError = Object.keys(next).length > 0
    setSummaryError(hasError ? '入力内容にエラーがあります。各項目を確認してください' : null)
    return !hasError
  }

  const handleSave = async () => {
    if (!validate()) {
      return
    }

    const confirmed = await confirm('記録しますか？', { confirmLabel: 'はい', cancelLabel: 'いいえ' })
    if (!confirmed) {
      return
    }

    const id = mealLogId ?? crypto.randomUUID()
    const inputItems = items
      .map((item) => {
        const foodItem = foodItems.find((candidate) => candidate.id === item.foodItemId)
        if (!foodItem) {
          return null
        }
        const amountValue = resolveAmount(item.amount, foodItem)
        const ratio = amountValue / foodItem.servingAmount
        return {
          foodItemId: item.foodItemId,
          amount: amountValue,
          calories: Math.round(foodItem.calories * ratio * 10) / 10,
          protein: Math.round(foodItem.protein * ratio * 10) / 10,
          fat: Math.round(foodItem.fat * ratio * 10) / 10,
          carbohydrates: Math.round(foodItem.carbohydrates * ratio * 10) / 10,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const input: MealLogInput = {
      id,
      date: selectedDate,
      mealType: mealType as MealType,
      notes: notes.trim() || undefined,
      mealTime: mealTime ? combineDateAndTimeToISO(selectedDate, mealTime) : undefined,
      items: inputItems,
    }

    setIsSaving(true)
    try {
      await upsertMealLog(input)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
      showToast('食事記録を保存しました', 'success')
      onClose()
    } catch (error) {
      console.error('Supabaseへの食事記録の保存に失敗しました', error)
      setSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('食事記録の保存に失敗しました', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="calendar-detail__form">
      {summaryError ? <p className="calendar-detail__form-error">{summaryError}</p> : null}

      <label className="calendar-detail__field">
        <span>食事タイプ</span>
        <select value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
          <option value="">選択してください</option>
          <option value="breakfast">朝食</option>
          <option value="lunch">昼食</option>
          <option value="dinner">夕食</option>
          <option value="snack">間食</option>
          <option value="other">その他</option>
        </select>
        {errors.mealType ? <p className="calendar-detail__error">{errors.mealType}</p> : null}
      </label>

      <label className="calendar-detail__field">
        <span>食事時刻</span>
        <input type="time" value={mealTime} onChange={(event) => setMealTime(event.target.value)} />
      </label>

      <div className="calendar-detail__tabs calendar-detail__tabs--segment">
        <button
          type="button"
          className={`calendar-detail__tab ${inputMode === 'food' ? 'calendar-detail__tab--active' : ''}`}
          onClick={() => setInputMode('food')}
        >
          食材から選択（詳細入力）
        </button>
        <button
          type="button"
          className={`calendar-detail__tab ${inputMode === 'dish' ? 'calendar-detail__tab--active' : ''}`}
          onClick={() => setInputMode('dish')}
        >
          料理から選択（一括入力）
        </button>
      </div>

      {inputMode === 'food' ? (
        <GenreFoodPicker foodItems={foodItems} onSelect={addFoodSelection} onFoodItemDeleted={loadFoodItems} />
      ) : (
        <>
          <div className="calendar-detail__field calendar-detail__field--full">
            <span>登録済みの料理</span>
            <div className="calendar-detail__select-with-action">
              <select value={selectedDishId} onChange={(event) => setSelectedDishId(event.target.value)}>
                <option value="">選択してください</option>
                {dishes.map((dish) => (
                  <option key={dish.id} value={dish.id}>
                    {dish.name} ({Math.round(dish.totalCalories)}kcal)
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="calendar-detail__delete-button"
                onClick={handleDeleteDish}
                disabled={!selectedDishId || isDeletingDish}
              >
                {isDeletingDish ? '削除中...' : '削除'}
              </button>
            </div>
          </div>

          {mealSizes.length > 0 ? (
            <div className="calendar-detail__field calendar-detail__field--full">
              <span>サイズ</span>
              <select value={selectedMealSizeId} onChange={(event) => setSelectedMealSizeId(event.target.value)}>
                {mealSizes.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.name}（×{size.multiplier}）
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {selectedDish && dishPreviewTotals ? (
            <div className="calendar-detail__meal-totals">
              この内容で追加: {Math.round(dishPreviewTotals.calories)}kcal / P{Math.round(dishPreviewTotals.protein)}g F
              {Math.round(dishPreviewTotals.fat)}g C{Math.round(dishPreviewTotals.carbohydrates)}g
            </div>
          ) : null}

          <div className="calendar-detail__inline-fields">
            <button type="button" className="calendar-detail__secondary-button" onClick={handleAddDishToSelections} disabled={!selectedDish}>
              この内容で追加
            </button>
            <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsDishModalOpen(true)}>
              ＋新しい料理を作る
            </button>
          </div>
        </>
      )}

      {items.length > 0 ? (
        <div className="calendar-detail__log-list">
          {items.map((item) => {
            const foodItem = foodItems.find((candidate) => candidate.id === item.foodItemId)
            const previous = previousAmounts[item.foodItemId]
            const placeholder = previous != null ? String(previous) : foodItem ? String(foodItem.servingAmount) : ''
            return (
              <MealFoodItemCard
                key={item.key}
                value={item}
                foodItem={foodItem}
                placeholder={placeholder}
                onAmountChange={(value) => handleAmountChange(item.key, value)}
                onDelete={() => removeItem(item.key)}
              />
            )
          })}
        </div>
      ) : null}
      {errors.items ? <p className="calendar-detail__error">{errors.items}</p> : null}

      <div className="calendar-detail__meal-totals">
        合計（プレビュー）: {Math.round(previewTotals.calories)}kcal / P{Math.round(previewTotals.protein)}g F
        {Math.round(previewTotals.fat)}g C{Math.round(previewTotals.carbohydrates)}g
      </div>

      <div className="calendar-detail__exercise-form">
        <span>新しい食材をここで登録</span>
        <label className="calendar-detail__field">
          <span>食材名</span>
          <input
            type="text"
            value={newFood.name}
            onChange={(event) => handleNewFoodFieldChange('name', event.target.value)}
            placeholder="例: ゆで卵"
          />
          {errors.newFoodName ? <p className="calendar-detail__error">{errors.newFoodName}</p> : null}
        </label>
        <label className="calendar-detail__field">
          <span>絵文字（任意）</span>
          <input
            type="text"
            value={newFood.emoji}
            onChange={(event) => handleNewFoodFieldChange('emoji', event.target.value)}
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
              onClick={() => handleNewFoodFieldChange('emoji', emoji)}
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
            onChange={(event) => handleNewFoodFieldChange('category', event.target.value)}
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
              onChange={(event) => handleNewFoodFieldChange('servingAmount', event.target.value)}
              placeholder="100"
            />
          </label>
          <label className="calendar-detail__field">
            <span>単位</span>
            <input
              type="text"
              value={newFood.servingUnit}
              onChange={(event) => handleNewFoodFieldChange('servingUnit', event.target.value)}
              placeholder="g / 個 / 食分 など"
            />
          </label>
        </div>
        {errors.newFoodServingAmount ? <p className="calendar-detail__error">{errors.newFoodServingAmount}</p> : null}
        <p className="calendar-detail__description">
          下のカロリー・PFCは「基準量あたり」の値を入力してください（例: 卵1個なら基準量1・単位「個」）
        </p>
        <div className="calendar-detail__inline-fields">
          <label className="calendar-detail__field">
            <span>カロリー (kcal)</span>
            <input type="number" min="0" value={newFood.calories} onChange={(event) => handleNewFoodFieldChange('calories', event.target.value)} />
          </label>
          <label className="calendar-detail__field">
            <span>タンパク質 (g)</span>
            <input type="number" min="0" value={newFood.protein} onChange={(event) => handleNewFoodFieldChange('protein', event.target.value)} />
          </label>
        </div>
        <div className="calendar-detail__inline-fields">
          <label className="calendar-detail__field">
            <span>脂質 (g)</span>
            <input type="number" min="0" value={newFood.fat} onChange={(event) => handleNewFoodFieldChange('fat', event.target.value)} />
          </label>
          <label className="calendar-detail__field">
            <span>炭水化物 (g)</span>
            <input
              type="number"
              min="0"
              value={newFood.carbohydrates}
              onChange={(event) => handleNewFoodFieldChange('carbohydrates', event.target.value)}
            />
          </label>
        </div>
        {errors.newFoodCalories ? <p className="calendar-detail__error">{errors.newFoodCalories}</p> : null}

        {duplicateFoodSuggestion ? (
          <div className="calendar-detail__warning">
            「{newFood.name.trim()}」という類似の食材「{duplicateFoodSuggestion.name}」が既に存在します。それでも新規登録しますか？
            <div className="calendar-detail__inline-fields">
              <button type="button" className="calendar-detail__secondary-button" onClick={performCreateFoodItem}>
                はい（新規登録する）
              </button>
              <button type="button" className="calendar-detail__secondary-button" onClick={handleUseSimilarFoodItem}>
                いいえ（「{duplicateFoodSuggestion.name}」を使う）
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="calendar-detail__secondary-button" onClick={handleAddNewFoodItem}>
            この食材を登録して追加
          </button>
        )}
      </div>

      <label className="calendar-detail__field calendar-detail__field--full">
        <span>メモ</span>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="今日の気づきや食事コメント" />
      </label>

      <div className="calendar-detail__actions">
        <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
          {isSaving ? '保存中...' : '保存する'}
        </button>
        <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
          キャンセル
        </button>
      </div>

      <DishFormModal
        isOpen={isDishModalOpen}
        onClose={() => setIsDishModalOpen(false)}
        onSaved={() => {
          loadDishes()
          setIsDishModalOpen(false)
        }}
        foodItems={foodItems}
        onFoodItemDeleted={loadFoodItems}
      />
    </div>
  )
}
