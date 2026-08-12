import { useEffect, useMemo, useState } from 'react'
import type { DateString, FoodItem, MealLog, MealType } from '../../types'
import { getMealTypeLabel } from '../../utils/calendarHelpers'
import { fetchFoodItems, createFoodItem } from '../../api/foodItems'
import { fetchMealLogItems, fetchMealLogs, upsertMealLog, deleteMealLogRemote } from '../../api/mealLogs'
import type { MealLogInput } from '../../api/mealLogs'

type MealLogFoodSelectionForm = {
  key: string
  foodItemId: string
  amount: string
}

type MealLogFormState = {
  mealType: MealType | ''
  notes: string
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

const QUICK_FOOD_EMOJIS = ['🍚', '🥩', '🥦', '🍞', '🍜', '🍎', '🥛', '🍽️']
const DEFAULT_FOOD_EMOJI = '🍽️'
const ALL_CATEGORIES = 'all'
const UNCATEGORIZED = 'uncategorized'

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
}

export function MealLogForm({ mealLogs, setMealLogs, selectedDate, isMealFormOpen, setIsMealFormOpen, setIsFormOpen }: MealLogFormProps) {
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null)
  const [mealFormState, setMealFormState] = useState<MealLogFormState>(createEmptyMealFormState())
  const [mealFormErrors, setMealFormErrors] = useState<MealLogFormErrors>(createEmptyMealFormErrors())
  const [mealFormSummaryError, setMealFormSummaryError] = useState<string | null>(null)
  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  const [isMealSaving, setIsMealSaving] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES)

  useEffect(() => {
    fetchFoodItems()
      .then(setFoodItems)
      .catch((error) => {
        console.error('Supabaseから食材一覧の取得に失敗しました', error)
      })
  }, [])

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
    setSelectedCategory(ALL_CATEGORIES)
  }, [selectedDate, setIsMealFormOpen])

  const foodCategories = useMemo(
    () =>
      Array.from(new Set(foodItems.map((item) => item.category).filter((category): category is string => Boolean(category)))).sort(
        (a, b) => a.localeCompare(b, 'ja'),
      ),
    [foodItems],
  )

  const categoryFilteredFoodItems = useMemo(() => {
    if (selectedCategory === ALL_CATEGORIES) {
      return foodItems
    }
    if (selectedCategory === UNCATEGORIZED) {
      return foodItems.filter((item) => !item.category)
    }
    return foodItems.filter((item) => item.category === selectedCategory)
  }, [foodItems, selectedCategory])

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category)
  }

  const openMealForm = (mealIndex?: number) => {
    const existingLog = typeof mealIndex === 'number' ? mealLogs[mealIndex] : null

    setEditingMealIndex(typeof mealIndex === 'number' ? mealIndex : null)
    setMealFormErrors(createEmptyMealFormErrors())
    setMealFormSummaryError(null)
    setIsFormOpen(false)
    setIsMealFormOpen(true)

    if (!existingLog?.id) {
      setMealFormState(createEmptyMealFormState())
      return
    }

    setMealFormState({ ...createEmptyMealFormState(), mealType: existingLog.mealType, notes: existingLog.notes ?? '' })

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

  const handleMealFieldChange = (field: 'mealType' | 'notes', value: string) => {
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

  const handleSelectionAmountChange = (key: string, value: string) => {
    setMealFormState((current) => ({
      ...current,
      selections: current.selections.map((selection) => (selection.key === key ? { ...selection, amount: value } : selection)),
    }))
  }

  const handleAddNewFoodItem = async () => {
    const name = mealFormState.newFoodName.trim()
    const servingAmount = Number(mealFormState.newFoodServingAmount)
    const servingUnit = mealFormState.newFoodServingUnit.trim()
    const calories = Number(mealFormState.newFoodCalories)
    const protein = Number(mealFormState.newFoodProtein)
    const fat = Number(mealFormState.newFoodFat)
    const carbohydrates = Number(mealFormState.newFoodCarbohydrates)
    const category = mealFormState.newFoodCategory.trim() || undefined
    const emoji = mealFormState.newFoodEmoji.trim() || undefined

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
    } catch (error) {
      console.error('Supabaseへの食材登録に失敗しました', error)
      setMealFormErrors((current) => ({ ...current, newFoodName: '食材の登録に失敗しました' }))
    }
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
      items,
    }

    setIsMealSaving(true)
    try {
      await upsertMealLog(input)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
      setIsMealFormOpen(false)
      setEditingMealIndex(null)
    } catch (error) {
      console.error('Supabaseへの食事記録の保存に失敗しました', error)
      setMealFormSummaryError('保存に失敗しました。もう一度お試しください')
    } finally {
      setIsMealSaving(false)
    }
  }

  const deleteMealLog = async (mealIndex: number) => {
    const confirmed = window.confirm('この食事記録を本当に削除しますか？')
    if (!confirmed) {
      return
    }

    const target = mealLogs[mealIndex]
    if (!target?.id) {
      return
    }

    try {
      await deleteMealLogRemote(target.id)
      const refreshed = await fetchMealLogs()
      setMealLogs(refreshed)
    } catch (error) {
      console.error('Supabaseからの食事記録の削除に失敗しました', error)
      window.alert('削除に失敗しました。もう一度お試しください')
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

          <div className="calendar-detail__field calendar-detail__field--full">
            <span>カテゴリで絞り込み</span>
            <div className="calendar-detail__category-filter">
              <button
                type="button"
                className={`calendar-detail__category-chip${
                  selectedCategory === ALL_CATEGORIES ? ' calendar-detail__category-chip--active' : ''
                }`}
                onClick={() => handleCategoryChange(ALL_CATEGORIES)}
              >
                すべて
              </button>
              {foodCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`calendar-detail__category-chip${
                    selectedCategory === category ? ' calendar-detail__category-chip--active' : ''
                  }`}
                  onClick={() => handleCategoryChange(category)}
                >
                  {category}
                </button>
              ))}
              <button
                type="button"
                className={`calendar-detail__category-chip${
                  selectedCategory === UNCATEGORIZED ? ' calendar-detail__category-chip--active' : ''
                }`}
                onClick={() => handleCategoryChange(UNCATEGORIZED)}
              >
                未分類
              </button>
            </div>
          </div>

          <div className="calendar-detail__field calendar-detail__field--full">
            <span>食材を追加</span>
            <select
              key={selectedCategory}
              value=""
              onChange={(event) => {
                addFoodSelection(event.target.value)
              }}
            >
              <option value="">選択してください</option>
              {categoryFilteredFoodItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name}
                  {item.category ? `［${item.category}］` : ''}（基準 {item.servingAmount}{item.servingUnit} = {item.calories}kcal）
                </option>
              ))}
            </select>
          </div>

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
              {QUICK_FOOD_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="calendar-detail__secondary-button"
                  onClick={() => handleNewFoodFieldChange('newFoodEmoji', emoji)}
                >
                  {emoji}
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
            <button type="button" className="calendar-detail__secondary-button" onClick={handleAddNewFoodItem}>
              この食材を登録して追加
            </button>
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
          </div>
        </div>
      ) : (
        <p className="calendar-detail__empty">記録なし</p>
      )}
    </div>
  )
}
