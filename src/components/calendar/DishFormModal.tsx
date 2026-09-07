import { useEffect, useMemo, useState } from 'react'
import { DISH_CATEGORIES } from '../../types'
import type { DishCategory, DishWithDetails, FoodItem } from '../../types'
import { createDish, updateDish } from '../../api/dishes'
import { createFoodItem } from '../../api/foodItems'
import { suggestDishIngredients } from '../../api/dishIngredients'
import { formatDishAmountLabel, resolveDishItemUnit } from '../../utils/dishHelpers'
import { matchDishIngredientSuggestions, resolveDraftAmount } from '../../utils/dishIngredientHelpers'
import { GenreFoodPicker } from './GenreFoodPicker'
import { FoodItemFormModal } from './FoodItemFormModal'
import { useToast } from '../../hooks/useToast'
import './DishFormModal.css'

const DEFAULT_FOOD_EMOJI = '🍽️'

type DishItemForm = {
  key: string
  // 空文字列 = 未紐付け（AI材料提案で food_items マスタに一致しなかった食材）。
  foodItemId: string
  amount: string
  // 料理レシピの単位不一致・再発防止（2026年9月4日）：unit はユーザーが編集できず、
  // 表示・保存時に常に「選択した食材の serving_unit」へ解決する
  // （resolveDishItemUnit）。ここに持つ値は、食材が見つからない場合の
  // フォールバック（新規は食材の serving_unit、編集は既存 dish_food_items.unit）。
  fallbackUnit: string
  // 以下はAI材料提案由来（2026年9月7日）。foodItemId が空のときの表示・操作に使う。
  aiSuggestedName?: string
  aiSimilarFoodItemId?: string
  aiSimilarLabel?: string
  // AIが自動で紐付け／新規登録した行（2026年9月7日）。由来ラベルの表示に使う。
  // ユーザーが手動で食材を選び直すとクリアする。
  aiOrigin?: 'auto-link-similar' | 'auto-created'
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
  /** AI材料提案の「新規食材として登録」で食材を作成したときに呼ばれる
   * （呼び出し元は fetchFoodItems() を再実行して foodItems を最新化する想定）。 */
  onFoodItemCreated?: () => void
  /** 指定すると編集モードで開く。 */
  editingDish?: DishWithDetails | null
}

export function DishFormModal({
  isOpen,
  onClose,
  onSaved,
  foodItems,
  onFoodItemDeleted,
  onFoodItemCreated,
  editingDish,
}: DishFormModalProps) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DishCategory | ''>('')
  const [emoji, setEmoji] = useState('')
  const [items, setItems] = useState<DishItemForm[]>([])
  const [pickerResetKey, setPickerResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // AI材料提案（2026年9月7日）
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [suggestInfo, setSuggestInfo] = useState<string | null>(null)
  // null 以外なら FoodItemFormModal を開く（値は食材名の初期値）
  const [foodItemModalInitialName, setFoodItemModalInitialName] = useState<string | null>(null)
  // AI材料提案の途中で createFoodItem した食材。foodItems prop はまだ古いため、
  // 表示・照合・子コンポーネントへの受け渡しはこのローカル分をマージした一覧で行う。
  const [locallyCreatedFoodItems, setLocallyCreatedFoodItems] = useState<FoodItem[]>([])

  const availableFoodItems = useMemo(() => {
    if (locallyCreatedFoodItems.length === 0) {
      return foodItems
    }
    const existingIds = new Set(foodItems.map((item) => item.id))
    return [...foodItems, ...locallyCreatedFoodItems.filter((item) => !existingIds.has(item.id))]
  }, [foodItems, locallyCreatedFoodItems])

  const isEditing = editingDish != null

  useEffect(() => {
    if (!isOpen) {
      setName('')
      setCategory('')
      setEmoji('')
      setItems([])
      setError(null)
      setIsSaving(false)
      setIsSuggesting(false)
      setSuggestError(null)
      setSuggestInfo(null)
      setFoodItemModalInitialName(null)
      setLocallyCreatedFoodItems([])
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
    setIsSuggesting(false)
    setSuggestError(null)
    setSuggestInfo(null)
    setFoodItemModalInitialName(null)
    setLocallyCreatedFoodItems([])
    setPickerResetKey((key) => key + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingDish?.id])

  if (!isOpen) {
    return null
  }

  const addItem = (foodItemId: string) => {
    const foodItem = availableFoodItems.find((item) => item.id === foodItemId)
    if (!foodItem) {
      return
    }
    setItems((current) => [
      ...current,
      { key: createItemKey(), foodItemId, amount: String(foodItem.servingAmount), fallbackUnit: foodItem.servingUnit },
    ])
  }

  const linkedRow = (food: FoodItem, grams: number): DishItemForm => ({
    key: createItemKey(),
    foodItemId: food.id as string,
    amount: String(resolveDraftAmount(food, grams)),
    fallbackUnit: food.servingUnit,
  })

  const unlinkedRow = (
    suggestedName: string,
    grams: number,
    similar: { item: FoodItem; similarity: number } | null,
  ): DishItemForm => ({
    key: createItemKey(),
    foodItemId: '',
    amount: String(grams),
    fallbackUnit: 'g',
    aiSuggestedName: suggestedName,
    aiSimilarFoodItemId: similar ? (similar.item.id as string) : undefined,
    aiSimilarLabel: similar ? `${similar.item.name}（類似度${Math.round(similar.similarity * 100)}%）` : undefined,
  })

  const removeItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key))
  }

  const handleAmountChange = (key: string, value: string) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, amount: value } : item)))
  }

  // AI材料提案（2026年9月7日、2026年9月7日に自動登録へ拡張）：料理名から Gemini に
  // 材料候補（食材名＋概算グラム＋100gあたり栄養成分＋カテゴリ）を提案させ、既存の
  // nameMatching.ts で food_items と照合して下書きとしてフォームへ追加する。
  //   - 完全一致 / 類似候補あり … その食材へ（類似は確認を挟まず）自動紐付け
  //   - 一致も類似も無く有効な栄養成分あり … その場で createFoodItem し、その食材へ紐付け
  //   - それ以外（栄養成分が無効／欠落、または createFoodItem 失敗）… 「未登録の食材
  //     （要確認）」の手動フローへフォールバックし、保存もブロック
  // 料理そのものは保存ボタンを押すまで DB に書き込まない（従来通り）。AI呼び出しが
  // 失敗した場合は suggestError を表示するだけで、手動入力フローには影響しない。
  const handleSuggestIngredients = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setSuggestError('先に料理名を入力してください')
      return
    }
    setSuggestError(null)
    setSuggestInfo(null)
    setIsSuggesting(true)
    try {
      const suggestions = await suggestDishIngredients(trimmedName)
      if (suggestions.length === 0) {
        setSuggestError('AIから材料を取得できませんでした。手動で入力してください')
        return
      }

      const matched = matchDishIngredientSuggestions(suggestions, availableFoodItems)
      const draftItems: DishItemForm[] = []
      const newlyCreated: FoodItem[] = []
      let autoLinkedCount = 0
      let autoCreatedCount = 0
      let manualCount = 0

      for (const m of matched) {
        if (m.disposition === 'matched' && m.linkTo) {
          draftItems.push(linkedRow(m.linkTo, m.grams))
          continue
        }
        if (m.disposition === 'auto-link-similar' && m.linkTo) {
          draftItems.push({ ...linkedRow(m.linkTo, m.grams), aiOrigin: 'auto-link-similar', aiSuggestedName: m.suggestedName })
          autoLinkedCount += 1
          continue
        }
        if (m.disposition === 'auto-create' && m.foodItemDraft) {
          try {
            const created = await createFoodItem(m.foodItemDraft)
            newlyCreated.push(created)
            draftItems.push({ ...linkedRow(created, m.grams), aiOrigin: 'auto-created', aiSuggestedName: m.suggestedName })
            autoCreatedCount += 1
          } catch (createError) {
            console.error('AI材料の食材自動登録に失敗しました', createError)
            draftItems.push(unlinkedRow(m.suggestedName, m.grams, null))
            manualCount += 1
          }
          continue
        }
        // disposition === 'manual'（一致・類似・有効な栄養成分いずれも無し）
        draftItems.push(unlinkedRow(m.suggestedName, m.grams, null))
        manualCount += 1
      }

      if (newlyCreated.length > 0) {
        setLocallyCreatedFoodItems((current) => [...current, ...newlyCreated])
        // 親（MealLogWizardModal）の foodItems 一覧も追従させる。
        onFoodItemCreated?.()
      }
      setItems((current) => [...current, ...draftItems])
      setError(null)

      const infoParts: string[] = []
      if (autoCreatedCount > 0) infoParts.push(`${autoCreatedCount}件を新規食材として自動登録`)
      if (autoLinkedCount > 0) infoParts.push(`${autoLinkedCount}件を類似食材に自動紐付け`)
      if (manualCount > 0) infoParts.push(`${manualCount}件は要確認（下部で紐付けてください）`)
      setSuggestInfo(infoParts.length > 0 ? infoParts.join('／') : null)
    } catch (suggestionError) {
      console.error('AIによる材料提案に失敗しました', suggestionError)
      setSuggestError(
        suggestionError instanceof Error ? suggestionError.message : 'AIによる材料提案に失敗しました',
      )
    } finally {
      setIsSuggesting(false)
    }
  }

  // 行を選択した food_item に紐付ける（未紐付け行の手動紐付け・AI自動紐付け行の選び直し
  // の両方に使う）。ユーザーが自分で選んだ時点でAI由来ラベルはクリアする。
  const linkItemToFood = (key: string, foodItemId: string) => {
    const foodItem = availableFoodItems.find((food) => food.id === foodItemId)
    if (!foodItem) {
      return
    }
    setItems((current) =>
      current.map((item) =>
        item.key === key
          ? {
              key: item.key,
              foodItemId,
              amount: String(resolveDraftAmount(foodItem, Number(item.amount) || foodItem.servingAmount)),
              fallbackUnit: foodItem.servingUnit,
            }
          : item,
      ),
    )
  }

  // 選択した食材の serving_unit へ単位を固定する。食材が見つからない場合のみ
  // fallbackUnit（新規は食材の serving_unit、編集は既存 dish_food_items.unit）を使う。
  const unitForItem = (item: DishItemForm): string =>
    resolveDishItemUnit(
      availableFoodItems.find((food) => food.id === item.foodItemId),
      item.fallbackUnit,
    )

  const previewTotals = items.reduce(
    (totals, item) => {
      const foodItem = availableFoodItems.find((food) => food.id === item.foodItemId)
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
    // AI材料提案で food_items に一致しなかった行（未紐付け）が残っていると保存できない。
    const hasUnlinked = items.some((item) => !item.foodItemId || !availableFoodItems.some((food) => food.id === item.foodItemId))
    if (hasUnlinked) {
      setError('未登録の食材（要確認）があります。食材を紐付けるか、その行を削除してください')
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
    // Fragment：DishFormModal のオーバーレイと、その外側に置く FoodItemFormModal を並べる。
    <>
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

          {/* AI材料提案（2026年9月7日）：料理名から材料の下書きを生成してフォームへ
              追加する。DBには書き込まず、あくまで編集可能な下書き。失敗時はエラー表示のみ。 */}
          <div className="dish-form-modal__ai-suggest">
            <button
              type="button"
              className="calendar-detail__secondary-button"
              onClick={handleSuggestIngredients}
              disabled={isSuggesting || !name.trim()}
            >
              {isSuggesting ? 'AIが考え中...' : '✨ AIで材料を提案'}
            </button>
            <p className="calendar-detail__description">
              料理名からAIが材料と概算分量を下書きします。内容を確認・編集してから保存してください。
            </p>
            {suggestInfo ? <p className="dish-form-modal__ai-info">{suggestInfo}</p> : null}
            {suggestError ? <p className="calendar-detail__form-error">{suggestError}</p> : null}
          </div>

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

          <GenreFoodPicker key={pickerResetKey} foodItems={availableFoodItems} onSelect={addItem} onFoodItemDeleted={onFoodItemDeleted} />

          {items.length > 0 ? (
            <div className="calendar-detail__log-list">
              {items.map((item) => {
                const foodItem = availableFoodItems.find((food) => food.id === item.foodItemId)
                const isUnlinked = !item.foodItemId || !foodItem
                const unit = unitForItem(item)
                const aiOriginLabel =
                  !isUnlinked && item.aiOrigin === 'auto-created'
                    ? '✨ AIが新規食材として自動登録'
                    : !isUnlinked && item.aiOrigin === 'auto-link-similar'
                      ? '✨ 類似食材に自動で紐付け'
                      : null
                return (
                  <div
                    key={item.key}
                    className={`calendar-detail__meal-item${isUnlinked ? ' dish-form-modal__meal-item--unlinked' : ''}`}
                  >
                    <div className="calendar-detail__meal-head">
                      <span>
                        {isUnlinked
                          ? `⚠️ 未登録の食材（要確認）: ${item.aiSuggestedName ?? '不明な食材'}`
                          : `${foodItem?.emoji ?? DEFAULT_FOOD_EMOJI} ${foodItem?.name ?? '不明な食材'}`}
                      </span>
                      <button type="button" className="calendar-detail__delete-button" onClick={() => removeItem(item.key)}>
                        削除
                      </button>
                    </div>

                    {aiOriginLabel ? (
                      <div className="dish-form-modal__ai-origin">
                        <span>{aiOriginLabel}</span>
                        <label className="calendar-detail__field">
                          <span>別の食材に変更</span>
                          <select
                            value=""
                            onChange={(event) => {
                              if (event.target.value) {
                                linkItemToFood(item.key, event.target.value)
                              }
                            }}
                          >
                            <option value="">そのまま使う</option>
                            {availableFoodItems.map((food) => (
                              <option key={food.id} value={food.id}>
                                {food.emoji ?? DEFAULT_FOOD_EMOJI} {food.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ) : null}

                    {isUnlinked ? (
                      <div className="dish-form-modal__unlinked-actions">
                        {item.aiSimilarFoodItemId ? (
                          <button
                            type="button"
                            className="calendar-detail__secondary-button"
                            onClick={() => linkItemToFood(item.key, item.aiSimilarFoodItemId as string)}
                          >
                            「{item.aiSimilarLabel}」を使う
                          </button>
                        ) : null}
                        <label className="calendar-detail__field">
                          <span>食材を選んで紐付け</span>
                          <select
                            value=""
                            onChange={(event) => {
                              if (event.target.value) {
                                linkItemToFood(item.key, event.target.value)
                              }
                            }}
                          >
                            <option value="">選択してください</option>
                            {availableFoodItems.map((food) => (
                              <option key={food.id} value={food.id}>
                                {food.emoji ?? DEFAULT_FOOD_EMOJI} {food.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="calendar-detail__secondary-button"
                          onClick={() => setFoodItemModalInitialName(item.aiSuggestedName ?? '')}
                        >
                          新規食材として登録
                        </button>
                      </div>
                    ) : null}

                    <div className="calendar-detail__inline-fields">
                      <label className="calendar-detail__field">
                        <span>{isUnlinked ? '分量（g）' : formatDishAmountLabel(unit)}</span>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={item.amount}
                          onChange={(event) => handleAmountChange(item.key, event.target.value)}
                        />
                      </label>
                      {!isUnlinked ? (
                        <div className="calendar-detail__field">
                          <span>単位</span>
                          {/* 料理レシピの単位不一致・再発防止（2026年9月4日）：単位は
                              食材の基準単位（serving_unit）に固定。ユーザーは編集不可。 */}
                          <input type="text" value={unit} readOnly disabled aria-label="単位（食材の基準単位に固定）" />
                        </div>
                      ) : null}
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

    {/* 未登録食材の「新規食材として登録」用。DishFormModal のオーバーレイの外側に
        置き、クリックが DishFormModal の onClose に伝播しないようにする。 */}
    <FoodItemFormModal
      isOpen={foodItemModalInitialName !== null}
      initialName={foodItemModalInitialName ?? ''}
      onClose={() => setFoodItemModalInitialName(null)}
      onSaved={() => {
        // 親（MealLogWizardModal）に foodItems の再取得を依頼する。登録直後は
        // foodItems prop がまだ古いため自動紐付けはせず、ユーザーが「食材を選んで
        // 紐付け」または類似候補ボタンで紐付ける。
        onFoodItemCreated?.()
        setFoodItemModalInitialName(null)
      }}
      foodItems={availableFoodItems}
    />
    </>
  )
}
