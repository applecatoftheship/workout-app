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
import { getCurrentTimeHHMM, combineDateAndTimeToISO, extractTimeHHMMFromISO, getMealTypeLabel } from '../../utils/calendarHelpers'
import { matchDishIngredientSuggestions, resolveDraftAmount } from '../../utils/dishIngredientHelpers'
import type { DishIngredientSuggestion } from '../../utils/dishIngredientHelpers'
import { findMostSimilarName, matchByNameWithFallback } from '../../utils/nameMatching'
import type { MealPhotoAnalysisResult, MealPhotoLabelDraft } from '../../utils/mealPhotoHelpers'
import { FoodSelector } from './FoodSelector'
import { DishSelector } from './DishSelector'
import { DishFormModal } from './DishFormModal'
import { FoodItemFormModal } from './FoodItemFormModal'
import { MealFoodItemCard } from './MealFoodItemCard'
import type { MealFoodItemCardValue } from './MealFoodItemCard'
import { MealPhotoAnalyzeSection } from './MealPhotoAnalyzeSection'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'
import { useAuth } from '../../hooks/useAuth'
import { enqueueOutbox, hasPendingOutboxEntryFor } from '../../offline/outbox'
import { updateOfflineCache, withOfflineCache } from '../../offline/offlineCache'
import { applyMealEdit } from '../../offline/offlineEdits'
import { getNavigatorOnline, isNetworkError } from '../../utils/networkErrors'
import { guessMealTypeFromTime } from '../../utils/mealFormHelpers'
import type { DateString, DishWithDetails, FoodItem, MealLog, MealSize, MealType } from '../../types'
import './MealLogEntry.css'
import './MealForm.css'
import './CalendarForms.css'

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
// 記録画面ブラッシュアップ（2026年11月1日、John承認済み）：上記の3ステップを1画面に
// まとめた（MyFitnessPal・MacroFactor 等の記録アプリと同じく、選びながら合計を見て
// そのまま保存できるように）。上から「食事タイプ（時刻から自動推定・チップで変更）＋時刻」
// 「食材｜料理の切替＋📷写真」「検索＋ジャンル/カテゴリ＋一覧（FoodSelector/DishSelector）」
// 「選んだもの（量・kcal・×）＋合計」「料理名・メモ（任意、折りたたみ）」「保存」。
// 上記の保持機能（前回量プレースホルダー・誤上書き防止・食材/料理の登録・料理の編集/削除・
// サイズ倍率・確認ダイアログ・写真解析の未登録食材の解決）はすべて維持している。
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
  const { user } = useAuth()

  const isEditing = mealLogId !== undefined

  const [foodItems, setFoodItems] = useState<FoodItem[]>([])
  // 新規記録は現在時刻から食事タイプを推定して初期選択する（チップで変更可）。
  // 編集時は下の読み込み処理で既存の値に置き換わる。
  const [mealTime, setMealTime] = useState(getCurrentTimeHHMM())
  const [mealType, setMealType] = useState<MealType | ''>(() => (isEditing ? '' : guessMealTypeFromTime(getCurrentTimeHHMM())))
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
  const [selectedMealSizeId, setSelectedMealSizeId] = useState('')
  const [isDishModalOpen, setIsDishModalOpen] = useState(false)
  const [editingDish, setEditingDish] = useState<DishWithDetails | null>(null)
  const [isFoodItemModalOpen, setIsFoodItemModalOpen] = useState(false)
  // Gemini画像解析による食事入力（指示書2026-09-14）
  const [pendingPhotoIngredients, setPendingPhotoIngredients] = useState<PendingPhotoIngredient[]>([])
  // 未解決の写真食材から「新規食材として登録」した際、初期名をプリフィルするための
  // 専用FoodItemFormModalインスタンス（＋新しい食材を登録ボタンのisFoodItemModalOpen
  // とは独立。両者は同時に開かない前提だが、状態を混ぜるとどちらの操作か曖昧になるため分離した）。
  const [photoFoodItemModalInitialName, setPhotoFoodItemModalInitialName] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [summaryError, setSummaryError] = useState<string | null>(null)
  // オフラインで食材の内訳を読み込めなかった編集（2026年11月6日）。保存させない
  const [itemsUnavailable, setItemsUnavailable] = useState(false)
  // 既存記録の編集で、食材の内訳を読み込み終えたか（2026年11月6日）。読み込み中に食材を足して
  // 保存すると、送信時に元の食材が置き換わって消えるため、読み込み終えるまで保存させない
  const [itemsLoaded, setItemsLoaded] = useState(!mealLogId)
  const [isSaving, setIsSaving] = useState(false)

  const requestedFoodIdsRef = useRef<Set<string>>(new Set())

  // オフライン記録対応（2026年10月31日）：オフラインでも食材・料理・サイズを
  // 選べるよう、最後に取得できた一覧を端末に控えておき、通信できない時はそれを使う。
  const loadFoodItems = () => {
    withOfflineCache('foodItems', () => fetchFoodItems())
      .then(setFoodItems)
      .catch((error) => {
        console.error('Supabaseから食材一覧の取得に失敗しました', error)
      })
  }

  const loadDishes = () => {
    withOfflineCache('dishesWithDetails', () => fetchDishesWithDetails())
      .then(setDishes)
      .catch((error) => {
        console.error('Supabaseから料理一覧の取得に失敗しました', error)
      })
  }

  useEffect(() => {
    loadFoodItems()
    loadDishes()
    withOfflineCache('mealSizes', () => fetchMealSizes())
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

    const applyLoadedItems = (loadedItems: { foodItemId: string; amount: number }[]) => {
      setItemsLoaded(true)
      setItems(
        loadedItems.map((item) => {
          ensurePreviousAmountLoaded(item.foodItemId)
          return { key: createItemKey(), foodItemId: item.foodItemId, amount: String(item.amount) }
        }),
      )
    }
    // オフラインでの編集（2026年11月6日）：通信できないときは、一覧（端末の控えを含む）が
    // 持っている内訳を使う。内訳が無い（古い控え）場合は、食材が欠けたまま保存して
    // サーバー上の食材を消してしまわないよう、保存できない状態にする。
    const applyStoredItems = () => {
      if (existing.items) {
        applyLoadedItems(existing.items)
      } else {
        setItemsUnavailable(true)
        setSummaryError('オフラインのため食材の内訳を読み込めませんでした。オンラインに戻ってから編集してください')
      }
    }
    // 同じ記録に未送信の編集がある場合も、サーバーの内訳は古いので一覧（未送信の編集を重ねたもの）を使う
    if (!getNavigatorOnline() || hasPendingOutboxEntryFor(`meal:${mealLogId}`, user?.id)) {
      applyStoredItems()
    } else {
      fetchMealLogItems(mealLogId)
        .then(applyLoadedItems)
        .catch((error) => {
          console.error('Supabaseから食事記録の内訳取得に失敗しました', error)
          if (isNetworkError(error)) {
            applyStoredItems()
          } else {
            setSummaryError('食材の内訳を読み込めませんでした。画面を閉じて開き直してください')
          }
        })
    }
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
  const selectedDish = dishes.find((dish) => dish.id === selectedDishId)
  const selectedMealSize = mealSizes.find((size) => size.id === selectedMealSizeId)
  const effectiveMultiplier = mealSizes.length > 0 ? selectedMealSize?.multiplier ?? 1 : 1

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

  const handleDeleteDish = async (dish: DishWithDetails) => {
    if (!dish.id) {
      return
    }
    const confirmed = await confirm(`「${dish.name}」を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    try {
      await deleteDish(dish.id)
      if (selectedDishId === dish.id) {
        setSelectedDishId('')
      }
      loadDishes()
      showToast('料理を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの料理削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
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

  const handleSave = async () => {
    if (itemsUnavailable) {
      setSummaryError('オフラインのため食材の内訳を読み込めませんでした。オンラインに戻ってから編集してください')
      return
    }
    if (!itemsLoaded) {
      setSummaryError('食材の内訳を読み込み中です。読み込みが終わってから保存してください')
      return
    }
    if (!validate()) {
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

    // オフライン記録対応（2026年10月31日）：新規の食事記録は、オフライン、または
    // 送信中に通信が切れた場合に端末へ保存し、オンライン復帰時に自動で再送する。
    // id は端末側で採番済み（上の crypto.randomUUID()）で、送信は同じ id への upsert
    // のため、再送しても二重登録にならない。
    // オフラインでの編集（2026年11月6日）：既存記録の編集も同じ upsert（同じ id、食材は
    // 置き換え）として端末に保存し、一覧には先に反映する。
    const isNewMeal = !mealLogId
    // 同じ記録への未送信の操作があるか（あれば順番待ちに回す。トーストの理由の出し分けにも使う）
    const queuedBehindPending = !isNewMeal && getNavigatorOnline() && hasPendingOutboxEntryFor(`meal:${id}`, user?.id)
    const saveToDevice = (): boolean => {
      if (!user) {
        return false
      }
      return enqueueOutbox({
        kind: 'mealUpsert',
        id: crypto.randomUUID(),
        userId: user.id,
        createdAt: new Date().toISOString(),
        attempts: 0,
        label: `${selectedDate.slice(5).replace('-', '/')} ${getMealTypeLabel(input.mealType)} ${input.dishName ?? `${input.items.length}品目`}${isNewMeal ? '' : ' を編集'}`,
        input,
      })
    }
    const handleSavedToDevice = (saved: boolean) => {
      if (saved) {
        if (!isNewMeal) {
          const foodNames = input.items.map(
            (item) => foodItems.find((candidate) => candidate.id === item.foodItemId)?.name ?? '不明な食材',
          )
          setMealLogs((current) => applyMealEdit(current, input, foodNames))
          updateOfflineCache<MealLog[]>('mealLogs', (current) => applyMealEdit(current, input, foodNames))
        }
        showToast(queuedBehindPending ? '同じ記録の未送信の操作があるため端末に保存しました。順番に自動で反映します' : '通信できないため端末に保存しました。オンラインに戻ると自動で反映します', 'info')
        onClose()
      } else {
        setSummaryError('端末に保存できませんでした。ストレージの空き容量やプライベートブラウズ設定を確認してください')
        showToast('食事記録を保存できませんでした', 'error')
      }
    }
    if (!getNavigatorOnline() || queuedBehindPending) {
      handleSavedToDevice(saveToDevice())
      return
    }

    setIsSaving(true)
    try {
      try {
        await upsertMealLog(input)
      } catch (error) {
        if (isNetworkError(error)) {
          console.error('通信エラーのため食事記録を端末に保存します', error)
          handleSavedToDevice(saveToDevice())
          return
        }
        throw error
      }
      if (!isNewMeal) {
        // 編集内容は、取り直しが失敗しても一覧・控えに残るよう先に反映する（古い内容のまま
        // オフラインで再編集して、この編集を上書きしないように）
        const foodNames = input.items.map(
          (item) => foodItems.find((candidate) => candidate.id === item.foodItemId)?.name ?? '不明な食材',
        )
        setMealLogs((current) => applyMealEdit(current, input, foodNames))
        updateOfflineCache<MealLog[]>('mealLogs', (current) => applyMealEdit(current, input, foodNames))
      }
      // 端末の控えも最新にする（後でオフラインで開いたときに、削除・編集済みの記録が古いまま出ないように。2026年11月6日）
      const refreshed = await withOfflineCache('mealLogs', () => fetchMealLogs())
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

  const mealTypeOptions: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: '朝食' },
    { value: 'lunch', label: '昼食' },
    { value: 'dinner', label: '夕食' },
    { value: 'snack', label: '間食' },
    { value: 'other', label: 'その他' },
  ]

  return (
    <div className="calendar-detail__form meal-form">
      {summaryError ? <p className="calendar-detail__form-error">{summaryError}</p> : null}

      <section className="meal-form__section" aria-label="食事タイプと時刻">
        <div className="meal-form__meta">
          <div className="meal-picker__chips" role="group" aria-label="食事タイプ">
            {mealTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`calendar-detail__category-chip${mealType === option.value ? ' calendar-detail__category-chip--active' : ''}`}
                aria-pressed={mealType === option.value}
                onClick={() => {
                  setMealType(option.value)
                  setErrors((current) => ({ ...current, mealType: undefined }))
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            type="time"
            className="meal-form__time"
            value={mealTime}
            onChange={(event) => setMealTime(event.target.value)}
            aria-label="食事時刻"
          />
        </div>
        {errors.mealType ? <p className="calendar-detail__error">{errors.mealType}</p> : null}
      </section>

      <section className="meal-form__section" aria-label="食材・料理を追加">
        <div className="meal-form__add-head">
          <div className="meal-form__segment" role="tablist" aria-label="追加方法">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'food'}
              className={`meal-form__segment-button${inputMode === 'food' ? ' meal-form__segment-button--active' : ''}`}
              onClick={() => setInputMode('food')}
            >
              食材
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'dish'}
              className={`meal-form__segment-button${inputMode === 'dish' ? ' meal-form__segment-button--active' : ''}`}
              onClick={() => setInputMode('dish')}
            >
              料理
            </button>
          </div>
          <MealPhotoAnalyzeSection
            variant="compact"
            buttonLabel="📷 写真"
            description="料理の写真や栄養成分表示ラベルを撮影すると、AIが食材候補を下書き追加します。内容を確認してから保存してください。"
            onResult={handleMealPhotoResult}
          />
        </div>

        {inputMode === 'food' ? (
          <FoodSelector
            foodItems={foodItems}
            onSelect={addFoodSelection}
            onFoodItemDeleted={loadFoodItems}
            onRequestCreate={() => setIsFoodItemModalOpen(true)}
          />
        ) : (
          <DishSelector
            dishes={dishes}
            mealSizes={mealSizes}
            selectedDishId={selectedDishId}
            selectedMealSizeId={selectedMealSizeId}
            onSelectDish={setSelectedDishId}
            onSelectMealSize={setSelectedMealSizeId}
            onAdd={handleAddDishToSelections}
            onEdit={(dish) => setEditingDish(dish)}
            onDelete={(dish) => void handleDeleteDish(dish)}
            onRequestCreate={() => setIsDishModalOpen(true)}
          />
        )}
      </section>

      {/* Gemini画像解析による食事入力（指示書2026-09-14）：写真から検出したが
          food_itemsマスタに一致・類似候補が無く、有効な栄養成分での自動登録も
          できなかった食材。手動で紐付け／新規登録するまでitemsには入らない
          （合計・保存対象のどちらにも含まれない）。 */}
      {pendingPhotoIngredients.length > 0 ? (
        <section className="meal-form__section" aria-label="写真から検出した未登録の食材">
          <p className="meal-form__section-title">⚠️ 写真から検出した未登録の食材（要確認）</p>
          <div className="meal-wizard__added-list">
            {pendingPhotoIngredients.map((pending) => (
              <div key={pending.key} className="meal-wizard__pending-row">
                <div className="calendar-detail__meal-head">
                  <span>{pending.suggestedName}（約{pending.grams}g）</span>
                  <button
                    type="button"
                    className="meal-item-row__remove"
                    onClick={() => removePendingPhotoIngredient(pending.key)}
                    aria-label={`${pending.suggestedName}を外す`}
                  >
                    ×
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
        </section>
      ) : null}

      <section className="meal-form__section" aria-label="選んだもの">
        <p className="meal-form__section-title">選んだもの（{items.length}品）</p>
        {items.length > 0 ? (
          <div className="meal-picker__list meal-form__selected-list">
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
          <p className="meal-picker__empty">上の一覧から食材や料理を選ぶと、ここに追加されます</p>
        )}
        {errors.items ? <p className="calendar-detail__error">{errors.items}</p> : null}

        <div className="meal-form__totals" aria-label="合計">
          <span className="meal-form__totals-kcal">{Math.round(previewTotals.calories)}kcal</span>
          <span className="meal-form__totals-pfc">
            P{Math.round(previewTotals.protein)}g F{Math.round(previewTotals.fat)}g C{Math.round(previewTotals.carbohydrates)}g
          </span>
        </div>
      </section>

      {/* 料理名の表示機能（2026年9月15日追加）：任意入力。料理プリセット選択時
          （handleAddDishToSelections）・Gemini画像解析の下書き反映
          （handleMealPhotoResult）のどちらでも自動セットされる。メモとあわせて
          折りたたみにし、入力済みの場合は開いた状態で表示する。 */}
      <details className="meal-form__extra" open={dishName.trim() !== '' || notes.trim() !== '' || undefined}>
        <summary>料理名・メモ（任意）</summary>
        <div className="meal-form__extra-body">
          <label className="calendar-detail__field calendar-detail__field--full">
            <span>料理名</span>
            <input
              type="text"
              value={dishName}
              onChange={(event) => setDishName(event.target.value)}
              placeholder="例: 鶏の唐揚げ定食"
            />
          </label>
          <label className="calendar-detail__field calendar-detail__field--full">
            <span>メモ</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="今日の気づきや食事コメント"
            />
          </label>
        </div>
      </details>

      <div className="calendar-detail__actions">
        <button type="button" className="calendar-detail__button" onClick={handleSave} disabled={isSaving || items.length === 0}>
          {isSaving ? '保存中...' : '保存する'}
        </button>
        <button type="button" className="calendar-detail__secondary-button record-form__cancel" onClick={onClose} disabled={isSaving}>
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
          // 編集した料理はそのまま選択状態を維持する。
          if (wasEditingId) {
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
