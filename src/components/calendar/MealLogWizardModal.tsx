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
import { matchDishIngredientSuggestions, resolveDraftAmount } from '../../utils/dishIngredientHelpers'
import type { DishIngredientSuggestion } from '../../utils/dishIngredientHelpers'
import { findMostSimilarName, matchByNameWithFallback } from '../../utils/nameMatching'
import type { MealPhotoAnalysisResult, MealPhotoLabelDraft } from '../../utils/mealPhotoHelpers'
import { GenreFoodPicker } from './GenreFoodPicker'
import { DishFormModal } from './DishFormModal'
import { FoodItemFormModal } from './FoodItemFormModal'
import { MealFoodItemCard } from './MealFoodItemCard'
import type { MealFoodItemCardValue } from './MealFoodItemCard'
import { MealPhotoAnalyzeSection } from './MealPhotoAnalyzeSection'
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

// Gemini画像解析による食事入力（指示書2026-09-14）：写真解析結果のうち、
// food_itemsマスタに一致も類似候補も無く、有効な栄養成分による自動登録もできな
// かった食材（DishFormModalの「manual」disposition相当）。MealFoodItemCardValue
// （itemsステート）はfoodItemIdが必ず有効な食材を指す前提の設計のため、未解決の
// ままitemsへは入れず、この専用リストで保持し手動解決（紐付け／新規登録）される
// までstep2に留める。
type PendingPhotoIngredient = {
  key: string
  suggestedName: string
  grams: number
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
  // 料理名の表示機能（2026年9月15日追加）：任意入力。料理プリセット選択時の自動
  // セット・Gemini画像解析（料理写真）の下書き反映・手動入力のいずれでも埋まる。
  // 栄養計算のソースオブトゥルースは引き続きitems（食材ベース）のまま、これは
  // あくまで表示用ラベル。
  const [dishName, setDishName] = useState('')
  const [items, setItems] = useState<MealFoodItemCardValue[]>([])
  const [previousAmounts, setPreviousAmounts] = useState<Record<string, number | null>>({})
  const [inputMode, setInputMode] = useState<'food' | 'dish'>('food')
  const [dishes, setDishes] = useState<DishWithDetails[]>([])
  const [mealSizes, setMealSizes] = useState<MealSize[]>([])
  const [selectedDishId, setSelectedDishId] = useState('')
  const [selectedDishCategory, setSelectedDishCategory] = useState<DishCategory | ''>('')
  // 料理のキーワード検索（2026年9月7日）：登録済み料理が増え目的の料理を探しにくく
  // なったため。GenreFoodPickerの「食材名で検索」と同じ独立フィルタの方針で、
  // カテゴリ絞り込みとはAND（大文字小文字を区別しない部分一致）。
  const [dishSearchQuery, setDishSearchQuery] = useState('')
  const [selectedMealSizeId, setSelectedMealSizeId] = useState('')
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<DishWithDetails | null>(null)
  const [isDeletingDish, setIsDeletingDish] = useState(false)
  const [isFoodItemModalOpen, setIsFoodItemModalOpen] = useState(false)
  // Gemini画像解析による食事入力（指示書2026-09-14）
  const [pendingPhotoIngredients, setPendingPhotoIngredients] = useState<PendingPhotoIngredient[]>([])
  // 未解決の写真食材から「新規食材として登録」した際、初期名をプリフィルするための
  // 専用FoodItemFormModalインスタンス（＋新しい食材を登録ボタンのisFoodItemModalOpen
  // とは独立。両者は同時に開かない前提だが、状態を混ぜるとどちらの操作か曖昧になるため分離した）。
  const [photoFoodItemModalInitialName, setPhotoFoodItemModalInitialName] = useState<string | null>(null)
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
    setDishName(existing.dishName ?? '')
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

  // Gemini画像解析による食事入力（指示書2026-09-14）：写真1枚から検出した食材候補
  // （料理写真＝複数食材、栄養成分ラベル＝1食材）を、DishFormModal.handleSuggestIngredients
  // と同じ4分岐ロジック（matchDishIngredientSuggestions）でfood_itemsマスタと照合する。
  //   - 完全一致／類似候補あり／有効な栄養成分での自動登録 … 確認なしでitemsへ追加
  //   - 一致・類似・有効な栄養成分いずれも無い … pendingPhotoIngredientsへ回し、
  //     下部の「未登録の食材（要確認）」で手動解決されるまでitemsには入れない
  //     （0kcal空レコード保存バグの再発防止として2026年9月14日に確立した
  //     「itemsは常に解決済みのfoodItemIdのみを持つ」という不変条件を維持するため）。
  const addResolvedPhotoItem = (foodItem: FoodItem, grams: number) => {
    ensurePreviousAmountLoaded(foodItem.id as string)
    setItems((current) => [
      ...current,
      { key: createItemKey(), foodItemId: foodItem.id as string, amount: String(resolveDraftAmount(foodItem, grams)) },
    ])
  }

  const handleMealPhotoDishItems = async (suggestions: DishIngredientSuggestion[]) => {
    const matched = matchDishIngredientSuggestions(suggestions, foodItems)
    const newPending: PendingPhotoIngredient[] = []
    let addedCount = 0
    let autoLinkedCount = 0
    let autoCreatedCount = 0
    let manualCount = 0

    for (const m of matched) {
      if (m.disposition === 'matched' && m.linkTo) {
        addResolvedPhotoItem(m.linkTo, m.grams)
        addedCount += 1
        continue
      }
      if (m.disposition === 'auto-link-similar' && m.linkTo) {
        addResolvedPhotoItem(m.linkTo, m.grams)
        autoLinkedCount += 1
        continue
      }
      if (m.disposition === 'auto-create' && m.foodItemDraft) {
        try {
          const created = await createFoodItem(m.foodItemDraft)
          loadFoodItems()
          addResolvedPhotoItem(created, m.grams)
          autoCreatedCount += 1
        } catch (createError) {
          console.error('AI写真解析の食材自動登録に失敗しました', createError)
          newPending.push({ key: createItemKey(), suggestedName: m.suggestedName, grams: m.grams })
          manualCount += 1
        }
        continue
      }
      // disposition === 'manual'（一致・類似・有効な栄養成分いずれも無し）
      newPending.push({ key: createItemKey(), suggestedName: m.suggestedName, grams: m.grams })
      manualCount += 1
    }

    if (newPending.length > 0) {
      setPendingPhotoIngredients((current) => [...current, ...newPending])
    }
    setErrors((current) => ({ ...current, items: undefined }))

    const infoParts: string[] = []
    if (addedCount > 0) infoParts.push(`${addedCount}件を追加`)
    if (autoLinkedCount > 0) infoParts.push(`${autoLinkedCount}件を類似食材に自動紐付け`)
    if (autoCreatedCount > 0) infoParts.push(`${autoCreatedCount}件を新規食材として自動登録`)
    if (manualCount > 0) infoParts.push(`${manualCount}件は要確認（下部で紐付けてください）`)
    showToast(
      infoParts.length > 0 ? `写真から${infoParts.join('／')}` : '写真から食材を検出できませんでした',
      infoParts.length > 0 ? 'success' : 'error',
    )
  }

  // 栄養成分ラベルの写真は1食材分のみ返るため、DishIngredientSuggestion（100gあたり
  // 基準）へは変換せず、ラベル自体の基準量をそのまま使う専用の4分岐を行う
  // （auto-createでfood_itemsへ登録する際もservingAmount:100固定にはしない）。
  const handleMealPhotoLabelItem = async (draft: MealPhotoLabelDraft) => {
    const exact = matchByNameWithFallback(foodItems, draft.name)
    if (exact) {
      addResolvedPhotoItem(exact, draft.servingAmount)
      showToast(`写真から「${exact.name}」を追加しました`, 'success')
      return
    }
    const similar = findMostSimilarName(foodItems, draft.name)
    if (similar) {
      addResolvedPhotoItem(similar.item, draft.servingAmount)
      showToast(`写真から類似食材「${similar.item.name}」に自動紐付けしました`, 'success')
      return
    }
    try {
      const created = await createFoodItem({
        name: draft.name,
        servingAmount: draft.servingAmount,
        servingUnit: draft.servingUnit,
        calories: draft.calories,
        protein: draft.protein,
        fat: draft.fat,
        carbohydrates: draft.carbohydrates,
        category: draft.category,
      })
      loadFoodItems()
      addResolvedPhotoItem(created, draft.servingAmount)
      showToast(`写真から「${created.name}」を新規食材として登録しました`, 'success')
    } catch (createError) {
      console.error('AI写真解析（ラベル）の食材自動登録に失敗しました', createError)
      setPendingPhotoIngredients((current) => [
        ...current,
        { key: createItemKey(), suggestedName: draft.name, grams: draft.servingAmount },
      ])
      showToast('食材の自動登録に失敗しました。下部で手動登録してください', 'error')
    }
  }

  const handleMealPhotoResult = (result: MealPhotoAnalysisResult) => {
    if (result.type === 'dish') {
      // 料理名の表示機能（2026年9月15日追加）：Geminiが料理名を推定できていれば
      // 料理名欄へ編集可能な下書きとして反映する（DBには保存ボタンを押すまで
      // 書き込まれない。既存のAI提案の設計方針を踏襲）。推定できなかった場合
      // （result.name未指定）は既存の入力内容を上書きしない。
      if (result.name) {
        setDishName(result.name)
      }
      void handleMealPhotoDishItems(result.items)
      return
    }
    void handleMealPhotoLabelItem(result.draft)
  }

  const resolvePendingPhotoIngredient = (key: string, foodItemId: string, grams: number) => {
    const foodItem = foodItems.find((food) => food.id === foodItemId)
    if (!foodItem) {
      return
    }
    addResolvedPhotoItem(foodItem, grams)
    setPendingPhotoIngredients((current) => current.filter((pending) => pending.key !== key))
  }

  const removePendingPhotoIngredient = (key: string) => {
    setPendingPhotoIngredients((current) => current.filter((pending) => pending.key !== key))
  }

  // 料理マスタ大幅拡充（2026年9月3日）：122件運用のためカテゴリで絞り込む。
  const categoryFilteredDishes =
    selectedDishCategory === '' ? dishes : dishes.filter((dish) => dish.category === selectedDishCategory)

  // キーワード検索（カテゴリ絞り込みの結果にさらにAND）。
  const visibleDishes = (() => {
    const query = dishSearchQuery.trim().toLowerCase()
    if (!query) {
      return categoryFilteredDishes
    }
    return categoryFilteredDishes.filter((dish) => dish.name.toLowerCase().includes(query))
  })()

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
    // 料理名の表示機能（2026年9月15日追加）：料理プリセット選択時に料理名欄へ
    // 自動セットする（保存前にユーザーが編集・クリア可能な通常の入力欄。複数の
    // 料理を続けて選んだ場合は指示書の判断通り上書きでよい）。
    setDishName(selectedDish.name)
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

    // validate()のitems.length===0チェックは選択操作の件数（items state）のみを
    // 見ており、選択後に対象の食材が論理削除される等でfoodItemsから解決できなく
    // なったケースを検知できない（例：GenreFoodPickerの「削除する食材」で選択済み
    // 食材自身を削除した場合）。その場合items.length>=1のままvalidate()を通過して
    // しまうため、実際にAPIへ送るinputItemsの件数を別途ここで検査する
    // （0kcal空レコードがmeal_logsに保存されてしまう不具合の修正、2026年9月14日）。
    // 全件不一致（inputItems.length===0）だけでなく、一部のみ不一致（選択した
    // うちの一部だけが解決できない）の場合も、黙って残りだけで保存せず同じ導線で
    // ブロックする（2026年9月14日、部分欠落ケースへの対応拡張）。
    if (inputItems.length !== items.length) {
      setErrors((current) => ({
        ...current,
        items:
          inputItems.length === 0
            ? '選択した食材が見つかりません（削除された可能性があります）。選び直してください'
            : '選択した食材の一部が見つかりませんでした。再度選び直してください',
      }))
      setSummaryError(
        inputItems.length === 0
          ? '選択した食材が見つかりません。食材を選び直してください'
          : '選択した食材の一部が見つかりませんでした。食材を選び直してください',
      )
      setStep(2)
      return
    }

    const confirmed = await confirm('記録しますか？', { confirmLabel: 'はい', cancelLabel: 'いいえ' })
    if (!confirmed) {
      return
    }

    const input: MealLogInput = {
      id,
      date: selectedDate,
      mealType: mealType as MealType,
      notes: notes.trim() || undefined,
      mealTime: mealTime ? combineDateAndTimeToISO(selectedDate, mealTime) : undefined,
      dishName: dishName.trim() || undefined,
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
                <MealPhotoAnalyzeSection
                  description="料理の写真や栄養成分表示ラベルを撮影すると、AIが食材候補を下書き追加します。内容を確認してから保存してください。"
                  onResult={handleMealPhotoResult}
                />
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
                  <span>料理名で検索</span>
                  <input
                    type="text"
                    value={dishSearchQuery}
                    onChange={(event) => setDishSearchQuery(event.target.value)}
                    placeholder="例: カレー"
                  />
                  {dishSearchQuery.trim() && visibleDishes.length === 0 ? (
                    <p className="calendar-detail__description">一致する料理が見つかりません</p>
                  ) : null}
                </div>

                <div className="calendar-detail__field calendar-detail__field--full">
                  <span>登録済みの料理</span>
                  <div className="calendar-detail__select-with-action">
                    <select value={selectedDishId} onChange={(event) => setSelectedDishId(event.target.value)}>
                      <option value="">選択してください</option>
                      {visibleDishes.map((dish) => (
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

          {/* 料理名の表示機能（2026年9月15日追加）：任意入力。料理プリセット選択時
              （handleAddDishToSelections）・Gemini画像解析の下書き反映
              （handleMealPhotoResult）のどちらでも自動セットされるが、ここで
              いつでも編集・クリアできる通常の入力欄。food/dishどちらのタブでも
              共通して見えるよう、タブ切り替えの外に置く。 */}
          <div className="calendar-detail__exercise-form">
            <label className="calendar-detail__field calendar-detail__field--full">
              <span>料理名（任意）</span>
              <input
                type="text"
                value={dishName}
                onChange={(event) => setDishName(event.target.value)}
                placeholder="例: 鶏の唐揚げ定食"
              />
            </label>
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

          {/* Gemini画像解析による食事入力（指示書2026-09-14）：写真から検出したが
              food_itemsマスタに一致・類似候補が無く、有効な栄養成分での自動登録も
              できなかった食材。手動で紐付け／新規登録するまでitemsには入らない
              （合計プレビュー・保存対象のどちらにも含まれない）。 */}
          {pendingPhotoIngredients.length > 0 ? (
            <div className="calendar-detail__exercise-form">
              <span>⚠️ 写真から検出した未登録の食材（要確認）</span>
              <div className="meal-wizard__added-list">
                {pendingPhotoIngredients.map((pending) => (
                  <div key={pending.key} className="meal-wizard__pending-row">
                    <div className="calendar-detail__meal-head">
                      <span>{pending.suggestedName}（約{pending.grams}g）</span>
                      <button
                        type="button"
                        className="calendar-detail__delete-button"
                        onClick={() => removePendingPhotoIngredient(pending.key)}
                      >
                        削除
                      </button>
                    </div>
                    <div className="meal-wizard__pending-actions">
                      <label className="calendar-detail__field">
                        <span>食材を選んで紐付け</span>
                        <select
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              resolvePendingPhotoIngredient(pending.key, event.target.value, pending.grams)
                            }
                          }}
                        >
                          <option value="">選択してください</option>
                          {foodItems.map((food) => (
                            <option key={food.id} value={food.id}>
                              {food.emoji ?? '🍽️'} {food.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="calendar-detail__secondary-button"
                        onClick={() => setPhotoFoodItemModalInitialName(pending.suggestedName)}
                      >
                        新規食材として登録
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
            <button
              type="button"
              className="calendar-detail__button"
              onClick={handleSave}
              disabled={isSaving || items.length === 0}
            >
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
        onFoodItemCreated={loadFoodItems}
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

      {/* Gemini画像解析による食事入力（指示書2026-09-14）：未登録の写真食材の
          「新規食材として登録」用。DishFormModal.tsxの既存パターンと同じく、
          登録直後は自動紐付けせず（foodItems propがまだ古いため）、
          ユーザーが上の「食材を選んで紐付け」で改めて選ぶ。 */}
      <FoodItemFormModal
        isOpen={photoFoodItemModalInitialName !== null}
        initialName={photoFoodItemModalInitialName ?? ''}
        onClose={() => setPhotoFoodItemModalInitialName(null)}
        onSaved={() => {
          loadFoodItems()
          setPhotoFoodItemModalInitialName(null)
        }}
        foodItems={foodItems}
      />
    </div>
  )
}
