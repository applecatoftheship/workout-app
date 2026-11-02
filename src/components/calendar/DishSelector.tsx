import { useMemo, useState } from 'react'
import { DISH_GENRES } from '../../types'
import type { DishWithDetails, MealSize } from '../../types'
import { filterDishes } from '../../utils/mealFormHelpers'
import { SwipeableRow } from '../common/SwipeableRow'
import './MealForm.css'

// 記録画面ブラッシュアップ（2026年11月1日）：食事記録の料理選択。
// 従来の「カテゴリチップ＋検索欄＋プルダウン＋編集/削除ボタン＋サイズのプルダウン＋
// 追加ボタン」を、「検索欄＋カテゴリチップ＋タップで選ぶ一覧」→「選んだ料理のサイズ
// チップと内容確認＋追加／編集」にした。料理の削除は一覧の行を左スワイプ。
// 追加時の展開（サイズ倍率での食材への展開）は呼び出し元（MealLogWizardModal）の従来処理を使う。

type DishSelectorProps = {
  dishes: DishWithDetails[]
  mealSizes: MealSize[]
  selectedDishId: string
  selectedMealSizeId: string
  onSelectDish: (dishId: string) => void
  onSelectMealSize: (mealSizeId: string) => void
  onAdd: () => void
  onEdit: (dish: DishWithDetails) => void
  onDelete: (dish: DishWithDetails) => void
  onRequestCreate: () => void
}

export function DishSelector({
  dishes,
  mealSizes,
  selectedDishId,
  selectedMealSizeId,
  onSelectDish,
  onSelectMealSize,
  onAdd,
  onEdit,
  onDelete,
  onRequestCreate,
}: DishSelectorProps) {
  const [query, setQuery] = useState('')
  // 料理ジャンルの2段化（2026年11月2日）：大分類を選ぶと、その小分類のチップを2列目に出す。
  const [genre, setGenre] = useState('')
  const [category, setCategory] = useState('')
  const results = useMemo(() => filterDishes(dishes, { query, category, genre }), [dishes, query, category, genre])
  const genreCategories = DISH_GENRES.find((group) => group.genre === genre)?.categories ?? []
  const selectedDish = dishes.find((dish) => dish.id === selectedDishId)
  const selectedMealSize = mealSizes.find((size) => size.id === selectedMealSizeId)
  const multiplier = mealSizes.length > 0 ? selectedMealSize?.multiplier ?? 1 : 1

  if (selectedDish) {
    return (
      <div className="meal-picker">
        <div className="meal-picker__selected">
          <div className="meal-picker__selected-text">
            <span className="meal-picker__selected-name">
              {selectedDish.emoji ? `${selectedDish.emoji} ` : ''}
              {selectedDish.name}
            </span>
            <span className="meal-picker__selected-meta">
              {Math.round(selectedDish.totalCalories * multiplier)}kcal・P{Math.round(selectedDish.totalProtein * multiplier)} F
              {Math.round(selectedDish.totalFat * multiplier)} C{Math.round(selectedDish.totalCarbohydrates * multiplier)}
            </span>
          </div>
          <button type="button" className="meal-picker__link" onClick={() => onSelectDish('')}>
            選び直す
          </button>
        </div>
        {mealSizes.length > 0 ? (
          <div className="meal-picker__chips" role="group" aria-label="サイズ">
            {mealSizes.map((size) => (
              <button
                key={size.id}
                type="button"
                className={`calendar-detail__category-chip${selectedMealSizeId === size.id ? ' calendar-detail__category-chip--active' : ''}`}
                aria-pressed={selectedMealSizeId === size.id}
                onClick={() => size.id && onSelectMealSize(size.id)}
              >
                {size.name}（×{size.multiplier}）
              </button>
            ))}
          </div>
        ) : null}
        <div className="meal-picker__actions">
          <button type="button" className="meal-picker__primary" onClick={onAdd}>
            この料理を追加
          </button>
          <button type="button" className="meal-picker__secondary" onClick={() => onEdit(selectedDish)}>
            料理を編集
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="meal-picker">
      <input
        type="search"
        className="meal-picker__search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="料理を検索（例: カレー）"
        aria-label="料理を検索"
      />
      <div className="meal-picker__chips" role="group" aria-label="ジャンルで絞り込む">
        {DISH_GENRES.map(({ genre: option }) => (
          <button
            key={option}
            type="button"
            className={`calendar-detail__category-chip${genre === option ? ' calendar-detail__category-chip--active' : ''}`}
            aria-pressed={genre === option}
            onClick={() => {
              setGenre((current) => (current === option ? '' : option))
              setCategory('')
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {genreCategories.length > 1 ? (
        <div className="meal-picker__chips" role="group" aria-label="小分類で絞り込む">
          {genreCategories.map((option) => (
            <button
              key={option}
              type="button"
              className={`calendar-detail__category-chip${category === option ? ' calendar-detail__category-chip--active' : ''}`}
              aria-pressed={category === option}
              onClick={() => setCategory((current) => (current === option ? '' : option))}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}

      {results.length > 0 ? (
        <ul className="meal-picker__list">
          {results.map((dish) => (
            <li key={dish.id}>
              <SwipeableRow actions={[{ key: 'delete', label: '削除', tone: 'danger', onClick: () => onDelete(dish) }]}>
                <button type="button" className="meal-picker__item" onClick={() => dish.id && onSelectDish(dish.id)}>
                  <span className="meal-picker__item-name">
                    {dish.emoji ? `${dish.emoji} ` : ''}
                    {dish.name}
                  </span>
                  <span className="meal-picker__item-meta">{Math.round(dish.totalCalories)}kcal</span>
                </button>
              </SwipeableRow>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meal-picker__empty">一致する料理が見つかりません</p>
      )}

      <div className="meal-picker__footer">
        <button type="button" className="meal-picker__link" onClick={onRequestCreate}>
          ＋新しい料理を作る
        </button>
        {results.length > 0 ? <span className="meal-picker__hint">← スワイプで料理を削除</span> : null}
      </div>
    </div>
  )
}
