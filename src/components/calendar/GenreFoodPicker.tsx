import { useMemo, useState } from 'react'
import type { FoodItem } from '../../types'
import { deleteFoodItem } from '../../api/foodItems'
import { useToast } from '../../hooks/useToast'
import { useConfirm } from '../../hooks/useConfirm'

const UNCATEGORIZED = 'uncategorized'
const DEFAULT_FOOD_EMOJI = '🍽️'

// 食材／料理の区分整理（2026年9月3日、John承認済み）：食材のジャンル選択から
// 「料理・定食」区分を除外する定数ガード。料理は「料理から選択（一括入力）」側
// （dishesテーブル）に一本化する方針のため、food_items.categoryにこの値が
// 残っていてもジャンルチップとしては表示しない。表記ゆれ（区切り文字違い）にも
// 対応するため、区切り文字と空白を除去して正規化してから比較する。
// 既存データ（food_items）のcategory値そのものの移行は別途（本番DB変更のため
// チャットでの承認後に実施）。
const DISH_LIKE_CATEGORY_KEYS = new Set(['料理定食', '定食料理'])

function isDishLikeCategory(category: string): boolean {
  const normalized = category.replace(/[\s・･/／|｜、,]/g, '')
  return DISH_LIKE_CATEGORY_KEYS.has(normalized)
}

type GenreFoodPickerProps = {
  foodItems: FoodItem[]
  onSelect: (foodItemId: string) => void
  onFoodItemDeleted: () => void
}

export function GenreFoodPicker({ foodItems, onSelect, onFoodItemDeleted }: GenreFoodPickerProps) {
  const { showToast } = useToast()
  const confirm = useConfirm()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedDeleteId, setSelectedDeleteId] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  // UI/UXレビュー修正 項目5（2026年8月25日）：ジャンル選択→ドロップダウン閲覧の
  // 2段階でしか食材を探せなかったため、食材名での直接検索を追加した。
  // ジャンル選択の状態には影響しない独立した機能として実装している。
  const [searchQuery, setSearchQuery] = useState('')

  const foodCategories = useMemo(
    () =>
      Array.from(
        new Set(
          foodItems
            .map((item) => item.category)
            .filter((category): category is string => Boolean(category))
            .filter((category) => !isDishLikeCategory(category)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'ja')),
    [foodItems],
  )

  const searchResults = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) {
      return []
    }
    return foodItems.filter((item) => item.name.includes(query)).slice(0, 8)
  }, [foodItems, searchQuery])

  const categoryFilteredFoodItems = useMemo(() => {
    if (!selectedCategory) {
      return []
    }
    if (selectedCategory === UNCATEGORIZED) {
      return foodItems.filter((item) => !item.category)
    }
    return foodItems.filter((item) => item.category === selectedCategory)
  }, [foodItems, selectedCategory])

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category)
    setSelectedDeleteId('')
  }

  const handleDeleteFoodItem = async () => {
    const target = categoryFilteredFoodItems.find((item) => item.id === selectedDeleteId)
    if (!target) {
      return
    }

    const confirmed = await confirm(`「${target.name}」を削除しますか？この操作は取り消せません`)
    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteFoodItem(target.id as string)
      setSelectedDeleteId('')
      onFoodItemDeleted()
      showToast('食材を削除しました', 'success')
    } catch (error) {
      console.error('Supabaseからの食材削除に失敗しました', error)
      showToast('削除に失敗しました。もう一度お試しください', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="calendar-detail__field calendar-detail__field--full">
        <span>食材名で検索</span>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="例: 鶏むね肉"
        />
        {searchQuery.trim() && searchResults.length === 0 ? (
          <p className="calendar-detail__description">一致する食材が見つかりません</p>
        ) : null}
        {searchResults.length > 0 ? (
          <div className="calendar-detail__category-filter">
            {searchResults.map((item) => (
              <button
                key={item.id}
                type="button"
                className="calendar-detail__category-chip"
                onClick={() => {
                  onSelect(item.id as string)
                  setSearchQuery('')
                }}
              >
                {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="calendar-detail__field calendar-detail__field--full">
        <span>食材のジャンルを選択</span>
        <div className="calendar-detail__category-filter">
          {foodCategories.map((category) => (
            <button
              key={category}
              type="button"
              className={`calendar-detail__category-chip${
                selectedCategory === category ? ' calendar-detail__category-chip--active' : ''
              }`}
              onClick={() => handleSelectCategory(category)}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            className={`calendar-detail__category-chip${
              selectedCategory === UNCATEGORIZED ? ' calendar-detail__category-chip--active' : ''
            }`}
            onClick={() => handleSelectCategory(UNCATEGORIZED)}
          >
            その他 / 未分類
          </button>
        </div>
      </div>

      {selectedCategory ? (
        <div className="calendar-detail__field calendar-detail__field--full">
          <span>食材を追加</span>
          <select
            key={selectedCategory}
            value=""
            onChange={(event) => {
              if (event.target.value) {
                onSelect(event.target.value)
              }
            }}
          >
            <option value="">選択してください</option>
            {categoryFilteredFoodItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name} ({item.servingAmount}
                {item.servingUnit} = {item.calories}kcal)
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedCategory ? (
        <div className="calendar-detail__field calendar-detail__field--full">
          <span>削除する食材</span>
          <div className="calendar-detail__select-with-action">
            <select value={selectedDeleteId} onChange={(event) => setSelectedDeleteId(event.target.value)}>
              <option value="">選択してください</option>
              {categoryFilteredFoodItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.emoji ?? DEFAULT_FOOD_EMOJI} {item.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="calendar-detail__delete-button"
              onClick={handleDeleteFoodItem}
              disabled={!selectedDeleteId || isDeleting}
            >
              {isDeleting ? '削除中...' : '削除'}
            </button>
          </div>
        </div>
      ) : (
        <p className="calendar-detail__description">上のジャンルを選択すると、食材の候補が表示されます</p>
      )}
    </>
  )
}
