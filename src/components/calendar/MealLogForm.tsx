import { useEffect, useMemo, useState } from 'react'
import type { DateString, DishWithDetails, FoodItem, MealLog, MealSize, MealType } from '../../types'
import { getMealTypeLabel, getCurrentTimeHHMM, combineDateAndTimeToISO, extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import { fetchFoodItems, createFoodItem } from '../../api/foodItems'
import { fetchMealLogItems, fetchMealLogs, upsertMealLog, deleteMealLogRemote } from '../../api/mealLogs'
import type { MealLogInput } from '../../api/mealLogs'
import { fetchDishesWithDetails, fetchMealSizes, deleteDish } from '../../api/dishes'
import { GenreFoodPicker } from './GenreFoodPicker'
import { DishFormModal } from './DishFormModal'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { findMostSimilarName } from '../../utils/nameMatching'

type MealLogFoodSelectionForm = {
  key: string
  foodItemId: string
  amount: string
}

type MealLogFormState = {
  mealType: MealType | ''
  notes: string
  // リカバリー窓機能（スプリント4 Phase 1）：input type="time"用のHH:MM文字列。
  mealTime: string
  selections: MealLogFoodSelectionForm[]
  newFoodName: string
  newFoodServingAmount: string
  newFoodServingUnit: string
  newFoodCalories: string
  newFoodProtein: string
  newFoodFat: string
  newFoodCarbohydrates: string
  newFoodCategory: string
  newFoodEmoji: string
}

// UI/UXレビュー修正 項目5（2026年8月25日）：絵文字のみのボタンだと何を表す
// クイック選択かわからないため、各絵文字にラベルを付与した。
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
const DEFAULT_FOOD_EMOJI = '🍽️'

type MealLogFormErrors = {
  mealType?: string
  selections?: string
  newFoodName?: string
  newFoodServingAmount?: string
  newFoodCalories?: string
  newFoodProtein?: string
  newFoodFat?: string
  newFoodCarbohydrates?: string
}

const createEmptyMealFormState = (): MealLogFormState => ({
  mealType: '',
  notes: '',
  mealTime: getCurrentTimeHHMM(),
  selections: [],
  newFoodName: '',
  newFoodServingAmount: '100',
  newFoodServingUnit: 'g',
  newFoodCalories: '',
  newFoodProtein: '',
  newFoodFat: '',
  newFoodCarbohydrates: '',
  newFoodCategory: '',
  newFoodEmoji: '',
})

const createEmptyMealFormErrors = (): MealLogFormErrors => ({})

let selectionKeyCounter = 0
function createSelectionKey() {
  selectionKeyCounter += 1
  return `selection-${selectionKeyCounter}`
}

function resolveAmount(selectionAmount: string, foodItem: FoodItem | undefined) {
  if (!foodItem) {
    return 0
  }
  return selectionAmount.trim() === '' ? foodItem.servingAmount : Number(selectionAmount)
}

type MealLogFormProps = {
  mealLogs: MealLog[]
  setMealLogs: React.Dispatch<React.SetStateAction<MealLog[]>>
  selectedDate: DateString
  isMealFormOpen: boolean
  setIsMealFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** RecordFormModal（Phase B）からの自動オープン用。既存利用への影響なし。 */
  autoOpenToken?: number
  autoOpenIndex?: number
}

export function MealLogForm({
  mealLogs,
  setMealLogs,
  selectedDate,
  isMealFormOpen,
  setIsMealFormOpen,
  setIsFormOpen,
  autoOpenToken,
  autoOpenIndex,
}: MealLogFormProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null)
  const [mealFormState, setMealFormState] = useState<MealLogFormState>(createEmptyMealFormState())
  const [mealFormErrors, setMealFormErrors] = useState<MealLogFormErrors>(createEmptyMealFormErrors())
  const [mealFormSummaryError, setMealFormSummaryError] = useState<string | null>(null)
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [isMealSaving, setIsMealSaving] = useState(false)
  const [pickerResetKey, setPickerResetKey] = useState(0)
  const [inputMode, setInputMode] = useState<'food' | 'dish'>('food')
  const [dishes, setDishes] = useState<DishWithDetails[]>([])
  const [mealSizes, setMealSizes] = useState<MealSize[]>([])
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedMealSizeId, setSelectedMealSizeId] = useState('')
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [isDeletingDish, setIsDeletingDish] = useState(false)
  // 食材マスタ新規登録時の類似名確認（実装指示書v2 Phase C、2026年8月19日新設）：
  // 表記ゆれによる重複登録を防ぐため、登録前に類似名がないか確認する。
  // 食材名を編集したら確認状態はリセットする。
  const [duplicateFoodSuggestion, setDuplicateFoodSuggestion] = useState<{ name: string } | null>(null)

  const loadFoodItems = () => {
    fetchFoodItems()
      .then(setFoodItems)
      .catch((error) => {
        console.error('Supabaseから食材一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadFoodItems()
  }, [])

  const loadDishes = () => {
    fetchDishesWithDetails()
      .then(setDishes)
      .catch((error) => {
        console.error('Supabaseから料理一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadDishes()
    fetchMealSizes()
      .then(setMealSizes)
      .catch((error) => {
        console.error('Supabaseからサイズ一覧の取得に失敗しました', error)
      })
  }, [])

  useEffect(() => {
    if (mealSizes.length > 0 && !selectedMealSizeId) {
      setSelectedMealSizeId(mealSizes[0].id as string)
    }
  }, [mealSizes, selectedMealSizeId])

  const selectedMealLogs = useMemo(
    () => mealLogs.map((mealLog, index) => ({ mealLog, index })).filter(({ mealLog }) => mealLog.date === selectedDate),
    [mealLogs, selectedDate],
  )

  const mealTotals = useMemo(
    () =>
      selectedMealLogs.reduce(
        (totals, { mealLog }) => ({
          calories: totals.calories + mealLog.calories,
          protein: totals.protein + mealLog.protein,
          fat: totals.fat + mealLog.fat,
          carbohydrates: totals.carbohydrates + mealLog.carbohydrates,
        }),
        { calories: 0, protein: 0, fat: 0, carbohydrates: 0 },
      ),
    [selectedMealLogs],
  )

  useEffect(() => {
    setIsMealFormOpen(false)
    setEditingMealIndex(null)
    setPickerResetKey((key) => key + 1)
    setInputMode('food')
    setSelectedDishId('')
  }, [selectedDate, setIsMealFormOpen])

  useEffect(() => {
    if (autoOpenToken === undefined) {
      return
    }
    openMealForm(autoOpenIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenToken])

  const openMealForm = (mealIndex?: number) => {
    const existingLog = typeof mealIndex === 'number' ? mealLogs[mealIndex] : null

    setEditingMealIndex(typeof mealIndex === 'number' ? mealIndex : null)
    setMealFormErrors(createEmptyMealFormErrors())
    setMealFormSummaryError(null)
    setPickerResetKey((key) => key + 1)
    setInputMode('food')
    setSelectedDishId('')
    setIsFormOpen(false)
    setIsMealFormOpen(true)

    if (!existingLog?.id) {
      setMealFormState(createEmptyMealFormState())
      return
    }

    setMealFormState({
      ...createEmptyMealFormState(),
      mealType: existingLog.mealType,
      notes: existingLog.notes ?? '',
      mealTime: existingLog.mealTime ? extractTimeHHMMFromISO(existingLog.mealTime) : getCurrentTimeHHMM(),
    })

    fetchMealLogItems(existingLog.id)
      .then((items) => {
        setMealFormState((current) => ({
          ...current,
          selections: items.map((item) => ({
            key: createSelectionKey(),
            foodItemId: item.foodItemId,
            amount: String(item.amount),
          })),
        }))
      })
      .catch((error) => {
        console.error('Supabaseから食事記録の内訳取得に失敗しました', error)
      })
  }

  const handleMealFieldChange = (field: 'mealType' | 'notes' | 'mealTime', value: string) => {
    setMealFormState((current) => ({ ...current, [field]: value }))
  }

  const handleNewFoodFieldChange = (
    field:
      | 'newFoodName'
      | 'newFoodServingAmount'
      | 'newFoodServingUnit'
      | 'newFoodCalories'
      | 'newFoodProtein'
      | 'newFoodFat'
      | 'newFoodCarbohydrates'
      | 'newFoodCategory'
      | 'newFoodEmoji',
    value: string,
  ) => {
    if (field === 'newFoodName') {
      setDuplicateFoodSuggestion(null)
    }
    setMealFormState((current) => ({ ...current, [field]: value }))
  }

  const addFoodSelection = (foodItemId: string) => {
    if (!foodItemId) {
      return
    }
    setMealFormState((current) => ({
      ...current,
      selections: [...current.selections, { key: createSelectionKey(), foodItemId, amount: '' }],
    }))
  }

  const removeFoodSelection = (key: string) => {
    setMealFormState((current) => ({
      ...current,
      selections: current.selections.filter((selection) => selection.key !== key),
    }))
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
    const newSelections = selectedDish.items
      .filter((item) => item.foodItem)
      .map((item) => ({
        key: createSelectionKey(),
        foodItemId: item.foodItemId,
        amount: String(Math.round(item.amount * effectiveMultiplier * 10) / 10),
      }))
    setMealFormState((current) => ({
      ...current,
      selections: [...current.selections, ...newSelections],
    }))
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

  const handleSelectionAmountChange = (key: string, value: string) => {
    setMealFormState((current) => ({
      ...current,
      selections: current.selections.map((selection) => (selection.key === key ? { ...selection, amount: value } : selection)),
    }))
  }

  // 実際のInsert処理本体。類似名確認（handleAddNewFoodItem）を経てから、
  // または「はい、新規登録する」確定後に呼び出される。
  const performCreateFoodItem = async () => {
    const name = mealFormState.newFoodName.trim()
    const servingAmount = Number(mealFormState.newFoodServingAmount)
    const servingUnit = mealFormState.newFoodServingUnit.trim()
    const calories = Number(mealFormState.newFoodCalories)
    const protein = Number(mealFormState.newFoodProtein)
    const fat = Number(mealFormState.newFoodFat)
    const carbohydrates = Number(mealFormState.newFoodCarbohydrates)
    const category = mealFormState.newFoodCategory.trim() || undefined
    const emoji = mealFormState.newFoodEmoji.trim() || undefined

    try {
      const created = await createFoodItem({
        name,
        servingAmount,
        servingUnit,
        calories,
        protein,
        fat,
        carbohydrates,
        category,
        emoji,
      })
      setFoodItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      setMealFormState((current) => ({
        ...current,
        selections: [...current.selections, { key: createSelectionKey(), foodItemId: created.id as string, amount: '' }],
        newFoodName: '',
        newFoodServingAmount: '100',
        newFoodServingUnit: 'g',
        newFoodCalories: '',
        newFoodProtein: '',
        newFoodFat: '',
        newFoodCarbohydrates: '',
        newFoodCategory: '',
        newFoodEmoji: '',
      }))
      setMealFormErrors((current) => ({
        ...current,
        newFoodName: undefined,
        newFoodServingAmount: undefined,
        newFoodCalories: undefined,
      }))
      setDuplicateFoodSuggestion(null)
      showToast('食材を登録しました', 'success')
    } catch (error) {
      console.error('Supabaseへの食材登録に失敗しました', error)
      setMealFormErrors((current) => ({ ...current, newFoodName: '食材の登録に失敗しました' }))
      showToast('食材の登録に失敗しました', 'error')
    }
  }

  const handleAddNewFoodItem = async () => {
    const name = mealFormState.newFoodName.trim()
    const servingAmount = Number(mealFormState.newFoodServingAmount)
    const servingUnit = mealFormState.newFoodServingUnit.trim()
    const calories = Number(mealFormState.newFoodCalories)
    const protein = Number(mealFormState.newFoodProtein)
    const fat = Number(mealFormState.newFoodFat)
    const carbohydrates = Number(mealFormState.newFoodCarbohydrates)

    if (!name) {
      setMealFormErrors((current) => ({ ...current, newFoodName: '食材名は必須です' }))
      return
    }
    if (!Number.isFinite(servingAmount) || servingAmount <= 0 || !servingUnit) {
      setMealFormErrors((current) => ({ ...current, newFoodServingAmount: '基準量は0より大きい数値、単位は必須です' }))
      return
    }
    if (![calories, protein, fat, carbohydrates].every((value) => Number.isFinite(value) && value >= 0)) {
      setMealFormErrors((current) => ({ ...current, newFoodCalories: 'カロリー・PFCは0以上の数値で入力してください' }))
      return
    }

    // 食材マスタ新規登録時の類似名確認（実装指示書v2 Phase C、2026年8月19日新設）。
    // 類似の既存食材が見つかった場合は即登録せず、確認UI（JSX側）を表示する。
    const similarMatch = findMostSimilarName(foodItems, name)
    if (similarMatch) {
      setDuplicateFoodSuggestion({ name: similarMatch.item.name })
      return
    }

    await performCreateFoodItem()
  }

  const handleUseSimilarFoodItem = () => {
    const similarMatch = findMostSimilarName(foodItems, mealFormState.newFoodName.trim())
    if (!similarMatch || !similarMatch.item.id) {
      return
    }
    setDuplicateFoodSuggestion(null)
    setMealFormState((current) => ({
      ...current,
      selections: [...current.selections, { key: createSelectionKey(), foodItemId: similarMatch.item.id as string, amount: '' }],
      newFoodName: '',
      newFoodServingAmount: '100',
      newFoodServingUnit: 'g',
      newFoodCalories: '',
      newFoodProtein: '',
      newFoodFat: '',
      newFoodCarbohydrates: '',
      newFoodCategory: '',
      newFoodEmoji: '',
    }))
  }

  const mealFormPreviewTotals = useMemo(() => {
    return mealFormState.selections.reduce(
      (totals, selection) => {
        const foodItem = foodItems.find((item) => item.id === selection.foodItemId)
        if (!foodItem) {
          return totals
        }
        const amountValue = resolveAmount(selection.amount, foodItem)
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
  }, [foodItems, mealFormState.selections])

  const validateMealForm = () => {
    const errors: MealLogFormErrors = {}

    if (!mealFormState.mealType) {
      errors.mealType = '食事タイプは必須です'
    }
    if (mealFormState.selections.length === 0) {
      errors.selections = '少なくとも1つの食材を選択してください'
    }
    for (const selection of mealFormState.selections) {
      if (selection.amount.trim() !== '') {
        const amountValue = Number(selection.amount)
        if (!Number.isFinite(amountValue) || amountValue <= 0) {
          errors.selections = '摂取量は0より大きい数値で入力してください'
        }
      }
    }

    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setMealFormSummaryError('入力内容にエラーがあります。各項目を確認してください')
    } else {
      setMealFormSummaryError(null)
    }

    setMealFormErrors(errors)
    return !hasErrors
  }

  const saveMealLog = async () => {
    if (!validateMealForm()) {
      return
    }

    const existingLog = editingMealIndex !== null ? mealLogs[editingMealIndex] : null
    const id = existingLog?.id ?? crypto.randomUUID()

    const items = mealFormState.selections
      .map((selection) => {
        const foodItem = foodItems.find((item) => item.id === selection.foodItemId)
        if (!foodItem) {
          return null
        }
        const amountValue = resolveAmount(selection.amount, foodItem)
        const ratio = amountValue / foodItem.servingAmount
        return {
          foodItemId: selection.foodItemId,
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
      mealType: mealFormState.mealType as MealType,
      notes: mealFormState.notes.trim() || undefined,
      mealTime: mealFormState.mealTime ? combineDateAndTimeToISO(selectedDate, mealFormState.mealTime) : undefined,
      items,
    }

    setIsMealSaving(true)
    try {
      await upsertMealLog(input)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
      setIsMealFormOpen(false)
      setEditingMealIndex(null)
      showToast('食事記録を保存しました', 'success')
    } catch (error) {
      console.error('Supabaseへの食事記録の保存に失敗しました', error)
      setMealFormSummaryError('保存に失敗しました。もう一度お試しください')
      showToast('食事記録の保存に失敗しました', 'error')
    } finally {
      setIsMealSaving(false)
    }
  }

  const deleteMealLog = async (mealIndex: number) => {
    const target = mealLogs[mealIndex]
    if (!target?.id) {
      return
    }

    const confirmed = await confirm(`${target.date}の${getMealTypeLabel(target.mealType)}記録を削除しますか？`)
    if (!confirmed) {
      return
    }

    try {
      await deleteMealLogRemote(target.id)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
      showToast('食事記録を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食事記録の削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
      return
    }

    if (editingMealIndex === mealIndex) {
      setIsMealFormOpen(false)
      setEditingMealIndex(null)
    }
    if (editingMealIndex !== null && editingMealIndex > mealIndex) {
      setEditingMealIndex(editingMealIndex - 1)
    }
  }

  return (
    <>
    <div className="calendar-detail__section">
      <h4>食事記録</h4>
      <button type="button" className="calendar-detail__button" onClick={() => openMealForm()}>
        食事・PFCを記録
      </button>

      {selectedMealLogs.length > 0 && !isMealFormOpen ? (
        <>
          <div className="calendar-detail__meal-totals">
            合計: {mealTotals.calories}kcal / P{mealTotals.protein}g F{mealTotals.fat}g C{mealTotals.carbohydrates}g
          </div>
          <div className="calendar-detail__log-list">
            {selectedMealLogs.map(({ mealLog, index }) => (
              <div key={`${selectedDate}-meal-${index}`} className="calendar-detail__meal-item">
                <div className="calendar-detail__meal-head">
                  <span>{getMealTypeLabel(mealLog.mealType)}</span>
                  <div className="calendar-detail__log-actions">
                    <button type="button" className="calendar-detail__edit-button" onClick={() => openMealForm(index)}>
                      編集
                    </button>
                    <button type="button" className="calendar-detail__delete-button" onClick={() => deleteMealLog(index)}>
                      削除
                    </button>
                  </div>
                </div>
                <div className="calendar-detail__meal-row">内容: {mealLog.foods.join('・')}</div>
                <div className="calendar-detail__meal-row">
                  カロリー: {mealLog.calories}kcal / P{mealLog.protein}g F{mealLog.fat}g C{mealLog.carbohydrates}g
                </div>
                {mealLog.notes ? <p className="calendar-detail__description">メモ: {mealLog.notes}</p> : null}
              </div>
            ))}
          </div>
        </>
      ) : isMealFormOpen ? (
        <div className="calendar-detail__form">
          {mealFormSummaryError ? <p className="calendar-detail__form-error">{mealFormSummaryError}</p> : null}
          <label className="calendar-detail__field">
            <span>食事タイプ</span>
            <select value={mealFormState.mealType} onChange={(event) => handleMealFieldChange('mealType', event.target.value)}>
              <option value="">選択してください</option>
              <option value="breakfast">朝食</option>
              <option value="lunch">昼食</option>
              <option value="dinner">夕食</option>
              <option value="snack">間食</option>
              <option value="other">その他</option>
            </select>
            {mealFormErrors.mealType ? <p className="calendar-detail__error">{mealFormErrors.mealType}</p> : null}
          </label>

          <label className="calendar-detail__field">
            <span>食事時刻</span>
            <input
              type="time"
              value={mealFormState.mealTime}
              onChange={(event) => handleMealFieldChange('mealTime', event.target.value)}
            />
          </label>

          <div className="calendar-detail__tabs calendar-detail__tabs--segment">
            <button
              type="button"
              className={`calendar-detail__tab ${inputMode === 'food' ? 'calendar-detail__tab--active' : ''}`}
              onClick={() => setInputMode('food')}
            >
              食材から選択
            </button>
            <button
              type="button"
              className={`calendar-detail__tab ${inputMode === 'dish' ? 'calendar-detail__tab--active' : ''}`}
              onClick={() => setInputMode('dish')}
            >
              料理から選択
            </button>
          </div>

          {inputMode === 'food' ? (
            <GenreFoodPicker key={pickerResetKey} foodItems={foodItems} onSelect={addFoodSelection} onFoodItemDeleted={loadFoodItems} />
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
                <button
                  type="button"
                  className="calendar-detail__secondary-button"
                  onClick={handleAddDishToSelections}
                  disabled={!selectedDish}
                >
                  この内容で追加
                </button>
                <button type="button" className="calendar-detail__secondary-button" onClick={() => setIsDishModalOpen(true)}>
                  ＋新しい料理を作る
                </button>
              </div>
            </>
          )}

          {mealFormState.selections.length > 0 ? (
            <div className="calendar-detail__log-list">
              {mealFormState.selections.map((selection) => {
                const foodItem = foodItems.find((item) => item.id === selection.foodItemId)
                return (
                  <div key={selection.key} className="calendar-detail__meal-item">
                    <div className="calendar-detail__meal-head">
                      <span>
                        {foodItem?.emoji ?? DEFAULT_FOOD_EMOJI} {foodItem?.name ?? '不明な食材'}
                        {foodItem?.category ? (
                          <>
                            {' '}
                            <span className="calendar-detail__badge">{foodItem.category}</span>
                          </>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="calendar-detail__delete-button"
                        onClick={() => removeFoodSelection(selection.key)}
                      >
                        削除
                      </button>
                    </div>
                    <label className="calendar-detail__field">
                      <span>
                        摂取量（基準: {foodItem ? `${foodItem.servingAmount}${foodItem.servingUnit}` : '-'} / 空欄なら基準量のまま）
                      </span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selection.amount}
                        onChange={(event) => handleSelectionAmountChange(selection.key, event.target.value)}
                        placeholder={foodItem ? String(foodItem.servingAmount) : ''}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          ) : null}
          {mealFormErrors.selections ? <p className="calendar-detail__error">{mealFormErrors.selections}</p> : null}

          <div className="calendar-detail__meal-totals">
            合計（プレビュー）: {Math.round(mealFormPreviewTotals.calories)}kcal / P{Math.round(mealFormPreviewTotals.protein)}g F
            {Math.round(mealFormPreviewTotals.fat)}g C{Math.round(mealFormPreviewTotals.carbohydrates)}g
          </div>

          <div className="calendar-detail__exercise-form">
            <span>新しい食材をここで登録</span>
            <label className="calendar-detail__field">
              <span>食材名</span>
              <input
                type="text"
                value={mealFormState.newFoodName}
                onChange={(event) => handleNewFoodFieldChange('newFoodName', event.target.value)}
                placeholder="例: ゆで卵"
              />
              {mealFormErrors.newFoodName ? <p className="calendar-detail__error">{mealFormErrors.newFoodName}</p> : null}
            </label>
            <label className="calendar-detail__field">
              <span>絵文字（任意）</span>
              <input
                type="text"
                value={mealFormState.newFoodEmoji}
                onChange={(event) => handleNewFoodFieldChange('newFoodEmoji', event.target.value)}
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
                  onClick={() => handleNewFoodFieldChange('newFoodEmoji', emoji)}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
            <label className="calendar-detail__field">
              <span>カテゴリ（任意）</span>
              <input
                type="text"
                value={mealFormState.newFoodCategory}
                onChange={(event) => handleNewFoodFieldChange('newFoodCategory', event.target.value)}
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
                  value={mealFormState.newFoodServingAmount}
                  onChange={(event) => handleNewFoodFieldChange('newFoodServingAmount', event.target.value)}
                  placeholder="100"
                />
              </label>
              <label className="calendar-detail__field">
                <span>単位</span>
                <input
                  type="text"
                  value={mealFormState.newFoodServingUnit}
                  onChange={(event) => handleNewFoodFieldChange('newFoodServingUnit', event.target.value)}
                  placeholder="g / 個 / 食分 など"
                />
              </label>
            </div>
            {mealFormErrors.newFoodServingAmount ? (
              <p className="calendar-detail__error">{mealFormErrors.newFoodServingAmount}</p>
            ) : null}
            <p className="calendar-detail__description">
              下のカロリー・PFCは「基準量あたり」の値を入力してください（例: 卵1個なら基準量1・単位「個」）
            </p>
            <div className="calendar-detail__inline-fields">
              <label className="calendar-detail__field">
                <span>カロリー (kcal)</span>
                <input
                  type="number"
                  min="0"
                  value={mealFormState.newFoodCalories}
                  onChange={(event) => handleNewFoodFieldChange('newFoodCalories', event.target.value)}
                />
              </label>
              <label className="calendar-detail__field">
                <span>タンパク質 (g)</span>
                <input
                  type="number"
                  min="0"
                  value={mealFormState.newFoodProtein}
                  onChange={(event) => handleNewFoodFieldChange('newFoodProtein', event.target.value)}
                />
              </label>
            </div>
            <div className="calendar-detail__inline-fields">
              <label className="calendar-detail__field">
                <span>脂質 (g)</span>
                <input
                  type="number"
                  min="0"
                  value={mealFormState.newFoodFat}
                  onChange={(event) => handleNewFoodFieldChange('newFoodFat', event.target.value)}
                />
              </label>
              <label className="calendar-detail__field">
                <span>炭水化物 (g)</span>
                <input
                  type="number"
                  min="0"
                  value={mealFormState.newFoodCarbohydrates}
                  onChange={(event) => handleNewFoodFieldChange('newFoodCarbohydrates', event.target.value)}
                />
              </label>
            </div>
            {mealFormErrors.newFoodCalories ? <p className="calendar-detail__error">{mealFormErrors.newFoodCalories}</p> : null}

            {duplicateFoodSuggestion ? (
              <div className="calendar-detail__warning">
                「{mealFormState.newFoodName.trim()}」という類似の食材「{duplicateFoodSuggestion.name}」が既に存在します。
                それでも新規登録しますか？
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
            <textarea
              value={mealFormState.notes}
              onChange={(event) => handleMealFieldChange('notes', event.target.value)}
              rows={3}
              placeholder="今日の気づきや食事コメント"
            />
          </label>

          <div className="calendar-detail__actions">
            <button type="button" className="calendar-detail__button" onClick={saveMealLog} disabled={isMealSaving}>
              {isMealSaving ? '保存中...' : '保存する'}
            </button>
            {editingMealIndex !== null ? (
              <button
                type="button"
                className="calendar-detail__delete-button"
                onClick={() => deleteMealLog(editingMealIndex)}
              >
                この記録を削除
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">記録なし</p>
      )}
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
    </>
  )
}
