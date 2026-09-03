import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  fetchLatestFoodItemRecord,
  fetchMealLogItems,
  fetchMealLogs,
  upsertMealLog,
} from '../../api/mealLogs'
import type { MealLogInput } from '../../api/mealLogs'
import { fetchFoodItems } from '../../api/foodItems'
import { deleteDish, fetchDishesWithDetails, fetchMealSizes } from '../../api/dishes'
import { getCurrentTimeHHMM, combineDateAndTimeToISO, extractTimeHHMMFromISO } from '../../utils/calendarHelpers'
import { GenreFoodPicker } from './GenreFoodPicker'
import { DishFormModal } from './DishFormModal'
import { FoodItemFormModal } from './FoodItemFormModal'
import { MealFoodItemCard } from './MealFoodItemCard'
import type { MealFoodItemCardValue } from './MealFoodItemCard'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { DISH_CATEGORIES } from '../../types'
import type { DateString, DishCategory, DishWithDetails, FoodItem, MealLog, MealSize, MealType } from '../../types'
import './MealLogEntry.css'

// 食事記録画面の3ステップ画面遷移化（2026年9月3日、John承認済み）：
// 旧MealLogEditModal.tsx（1画面に全項目を縦積み）を、以下の3ステップの
// ウィザードに再構成した。
//   ステップ1: 食事タイプ＋食事時刻
//   ステップ2: 食材/料理の選択（「食材から選択（詳細入力）」「料理から選択（一括入力）」
//              の2タブは維持。複数を続けて追加できる）
//   ステップ3: 追加済み食品明細＋合計カロリー/PFC＋メモ＋保存
// 新規追加はステップ1から、既存記録の編集（mealLogId指定）はステップ3から開始し、
// いずれも「戻る」で前のステップへ遡れる（トレーニング編集フローとの一貫性を優先。
// John承認済み）。
//
// 旧MealLogEditModal.tsxからの移植で保持している既存機能（棚卸し済み、
// 移植漏れ防止）：
// - 前回実測量プレースホルダー（ensurePreviousAmountLoaded + requestedFoodIdsRef）
// - 食事タイミング別グルーピング（表示側MealSummaryが担当、当モーダルは無関係）
// - mealLogIdベースの誤上書き防止（handleSave: mealLogId ?? crypto.randomUUID()）
// - 「新しい食材を登録する」の別モーダル分離（FoodItemFormModal）
// - 「新しい料理を作る」の別モーダル（DishFormModal）
// - 料理削除ボタン（handleDeleteDish）
// - 料理のサイズ倍率展開（handleAddDishToSelections）
// - 保存前の確認ダイアログ（useConfirm）
//
// 「料理から選択」で追加した食品は保存時点でmeal_log_food_itemsへ個別食品として
// フラット展開され、dish_idは保存されない（スキーマ変更なしの方針）。編集時に
// 「これは元々どの料理だったか」をDBから再現する手段はないため、編集ステップ3では
// 常に個別食品の明細リストとして表示する。

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

type WizardStep = 1 | 2 | 3

const STEP_LABELS: Record<WizardStep, string> = {
  1: '食事タイプ',
  2: '食材・料理',
  3: '確認',
}

type FormErrors = {
  mealType?: string
  items?: string
}

type MealLogWizardModalProps = {
  mealLogs: MealLog[]
  setMealLogs: Dispatch<SetStateAction<MealLog[]>>
  selectedDate: DateString
  /** 未指定の場合は新規エントリの追加。 */
  mealLogId?: string
  onClose: () => void
}

export function MealLogWizardModal({ mealLogs, setMealLogs, selectedDate, mealLogId, onClose }: MealLogWizardModalProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()

  const isEditing = mealLogId !== undefined

  // 新規追加はステップ1から、編集はステップ3（確認画面）から開始する。
  const [step, setStep] = useState<WizardStep>(isEditing ? 3 : 1)

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
  const [selectedDishCategory, setSelectedDishCategory] = useState<DishCategory | ''>('')
  const [selectedMealSizeId, setSelectedMealSizeId] = useState('')
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<DishWithDetails | null>(null)
  const [isDeletingDish, setIsDeletingDish] = useState(false)
  const [isFoodItemModalOpen, setIsFoodItemModalOpen] = useState(false)
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

  // 食材ごとの「前回の実測量」取得（旧MealLogEditModalから移植）：同じ食材が
  // 複数回要求されても1回しか叩かないようrequestedFoodIdsRefでガードする。
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
    setErrors((current) => ({ ...current, items: undefined }))
  }

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleAmountChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, amount: value } : item)))
  }

  // 料理マスタ大幅拡充（2026年9月3日）：122件運用のためカテゴリで絞り込む。
  const categoryFilteredDishes =
    selectedDishCategory === '' ? dishes : dishes.filter((dish) => dish.category === selectedDishCategory)

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
    setErrors((current) => ({ ...current, items: undefined }))
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

  const goBack = () => {
    setSummaryError(null)
    setStep((current) => (current === 3 ? 2 : 1))
  }

  const goToStep2 = () => {
    if (!mealType) {
      setErrors((current) => ({ ...current, mealType: '食事タイプは必須です' }))
      setSummaryError('食事タイプを選択してください')
      return
    }
    setErrors((current) => ({ ...current, mealType: undefined }))
    setSummaryError(null)
    setStep(2)
  }

  const goToStep3 = () => {
    if (items.length === 0) {
      setErrors((current) => ({ ...current, items: '少なくとも1つの食材を選択してください' }))
      setSummaryError('食材または料理を1つ以上追加してください')
      return
    }
    setErrors((current) => ({ ...current, items: undefined }))
    setSummaryError(null)
    setStep(3)
  }

  const handleSave = async () => {
    if (!validate()) {
      // バリデーションエラーの内容に応じて該当ステップへ誘導する。
      if (!mealType) {
        setStep(1)
      } else if (items.length === 0) {
        setStep(2)
      } else {
        setStep(3)
      }
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
      <div className="meal-wizard__steps">
        {([1, 2, 3] as WizardStep[]).map((s) => (
          <div
            key={s}
            className={`meal-wizard__step${step === s ? ' meal-wizard__step--active' : ''}`}
            aria-current={step === s ? 'step' : undefined}
          >
            <span className="meal-wizard__step-num">{s}</span>
            <span>{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>

      {summaryError ? <p className="calendar-detail__form-error">{summaryError}</p> : null}

      {step === 1 ? (
        <div className="calendar-detail__exercise-form">
          <span>食事タイプ・時刻</span>
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
        </div>
      ) : null}

      {step === 2 ? (
        <>
          <div className="calendar-detail__exercise-form">
            <span>食材・料理を追加</span>
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
              <>
                <GenreFoodPicker foodItems={foodItems} onSelect={addFoodSelection} onFoodItemDeleted={loadFoodItems} />
                <button
                  type="button"
                  className="calendar-detail__secondary-button"
                  onClick={() => setIsFoodItemModalOpen(true)}
                >
                  ＋新しい食材を登録
                </button>
              </>
            ) : (
              <>
                <div className="calendar-detail__field calendar-detail__field--full">
                  <span>カテゴリで絞り込み</span>
                  <div className="calendar-detail__category-filter">
                    <button
                      type="button"
                      className={`calendar-detail__category-chip${
                        selectedDishCategory === '' ? ' calendar-detail__category-chip--active' : ''
                      }`}
                      onClick={() => {
                        setSelectedDishCategory('')
                        setSelectedDishId('')
                      }}
                    >
                      すべて
                    </button>
                    {DISH_CATEGORIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`calendar-detail__category-chip${
                          selectedDishCategory === option ? ' calendar-detail__category-chip--active' : ''
                        }`}
                        onClick={() => {
                          setSelectedDishCategory(option)
                          setSelectedDishId('')
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="calendar-detail__field calendar-detail__field--full">
                  <span>登録済みの料理</span>
                  <div className="calendar-detail__select-with-action">
                    <select value={selectedDishId} onChange={(event) => setSelectedDishId(event.target.value)}>
                      <option value="">選択してください</option>
                      {categoryFilteredDishes.map((dish) => (
                        <option key={dish.id} value={dish.id}>
                          {dish.emoji ? `${dish.emoji} ` : ''}
                          {dish.name} ({Math.round(dish.totalCalories)}kcal)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="calendar-detail__secondary-button"
                      onClick={() => selectedDish && setEditingDish(selectedDish)}
                      disabled={!selectedDishId}
                    >
                      編集
                    </button>
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
                  <button
                    type="button"
                    className="calendar-detail__secondary-button"
                    onClick={() => setIsDishModalOpen(true)}
                  >
                    ＋新しい料理を作る
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="calendar-detail__exercise-form">
            <span>追加済み（{items.length}品）</span>
            {items.length > 0 ? (
              <div className="meal-wizard__added-list">
                {items.map((item) => {
                  const foodItem = foodItems.find((candidate) => candidate.id === item.foodItemId)
                  const amountText =
                    item.amount.trim() !== ''
                      ? `${item.amount}${foodItem?.servingUnit ?? ''}`
                      : foodItem
                        ? `${foodItem.servingAmount}${foodItem.servingUnit}`
                        : ''
                  return (
                    <div key={item.key} className="meal-wizard__added-row">
                      <span>
                        {foodItem?.emoji ?? '🍽️'} {foodItem?.name ?? '不明な食材'}
                        {amountText ? ` / ${amountText}` : ''}
                      </span>
                      <button
                        type="button"
                        className="calendar-detail__delete-button"
                        onClick={() => removeItem(item.key)}
                      >
                        削除
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="calendar-detail__empty">まだ食品が追加されていません</p>
            )}
            {errors.items ? <p className="calendar-detail__error">{errors.items}</p> : null}

            <div className="calendar-detail__meal-totals">
              合計（プレビュー）: {Math.round(previewTotals.calories)}kcal / P{Math.round(previewTotals.protein)}g F
              {Math.round(previewTotals.fat)}g C{Math.round(previewTotals.carbohydrates)}g
            </div>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className="calendar-detail__exercise-form">
            <span>追加済み食品明細</span>
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
            ) : (
              <p className="calendar-detail__empty">まだ食品が追加されていません</p>
            )}
            {errors.items ? <p className="calendar-detail__error">{errors.items}</p> : null}

            <div className="calendar-detail__meal-totals">
              合計: {Math.round(previewTotals.calories)}kcal / P{Math.round(previewTotals.protein)}g F
              {Math.round(previewTotals.fat)}g C{Math.round(previewTotals.carbohydrates)}g
            </div>
          </div>

          <div className="calendar-detail__exercise-form">
            <span>メモ</span>
            <label className="calendar-detail__field calendar-detail__field--full">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="今日の気づきや食事コメント"
                aria-label="メモ"
              />
            </label>
          </div>
        </>
      ) : null}

      <div className="calendar-detail__actions">
        <div className="meal-wizard__nav">
          {step > 1 ? (
            <button type="button" className="calendar-detail__secondary-button" onClick={goBack} disabled={isSaving}>
              戻る
            </button>
          ) : null}

          {step === 1 ? (
            <button type="button" className="calendar-detail__button" onClick={goToStep2}>
              次へ
            </button>
          ) : null}

          {step === 2 ? (
            <button type="button" className="calendar-detail__button" onClick={goToStep3}>
              次へ
            </button>
          ) : null}

          {step === 3 ? (
            <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存する'}
            </button>
          ) : null}
        </div>
        <button type="button" className="calendar-detail__secondary-button" onClick={onClose} disabled={isSaving}>
          キャンセル
        </button>
      </div>

      <DishFormModal
        isOpen={isDishModalOpen || editingDish != null}
        editingDish={editingDish}
        onClose={() => {
          setIsDishModalOpen(false)
          setEditingDish(null)
        }}
        onSaved={() => {
          const wasEditingId = editingDish?.id ?? null
          loadDishes()
          setIsDishModalOpen(false)
          setEditingDish(null)
          // 編集した料理はそのまま選択状態を維持する。カテゴリを変更していても
          // 一覧に出るよう、絞り込みは「すべて」に戻す。
          if (wasEditingId) {
            setSelectedDishCategory('')
            setSelectedDishId(wasEditingId)
          }
        }}
        foodItems={foodItems}
        onFoodItemDeleted={loadFoodItems}
      />

      <FoodItemFormModal
        isOpen={isFoodItemModalOpen}
        onClose={() => setIsFoodItemModalOpen(false)}
        onSaved={() => {
          loadFoodItems()
          setIsFoodItemModalOpen(false)
        }}
        foodItems={foodItems}
      />
    </div>
  )
}
