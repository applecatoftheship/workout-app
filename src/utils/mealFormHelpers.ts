import type { DishWithDetails, FoodItem, MealType } from '../types'
import { normalizeExerciseQuery } from './exerciseSelectorHelpers'
import { isUncategorizedFoodCategory } from './foodCategoryHelpers'

// 記録画面ブラッシュアップ（2026年11月1日）：食事記録の1画面化で使う純粋関数。

/**
 * 食事時刻（HH:MM）から食事タイプの初期値を推定する（新規記録時のみ使用。チップで変更可）。
 * 4:00〜10:29 朝食／10:30〜14:59 昼食／15:00〜16:59 間食／17:00〜21:59 夕食／それ以外 間食
 */
export function guessMealTypeFromTime(hhmm: string): MealType {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!match) {
    return 'snack'
  }
  const minutes = Number(match[1]) * 60 + Number(match[2])
  if (minutes >= 4 * 60 && minutes < 10 * 60 + 30) {
    return 'breakfast'
  }
  if (minutes >= 10 * 60 + 30 && minutes < 15 * 60) {
    return 'lunch'
  }
  if (minutes >= 17 * 60 && minutes < 22 * 60) {
    return 'dinner'
  }
  return 'snack'
}

// 食材ジャンルの一覧から除外する「料理・定食」系（GenreFoodPicker.tsx と同じ判定）。
const DISH_LIKE_CATEGORY_KEYS = new Set(['料理定食', '定食料理'])

function isDishLikeCategory(category: string): boolean {
  const normalized = category.replace(/[\s・･/／|｜、,]/g, '')
  return DISH_LIKE_CATEGORY_KEYS.has(normalized)
}

/** 食材のジャンル一覧（名前順。未分類系・料理系は除く。未分類はチップを別に出す）。 */
export function listFoodCategories(foodItems: FoodItem[]): string[] {
  return Array.from(
    new Set(
      foodItems
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category))
        .filter((category) => !isDishLikeCategory(category) && !isUncategorizedFoodCategory(category)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ja'))
}

export const UNCATEGORIZED_FOOD_FILTER = '__uncategorized__'

/** 検索語・ジャンルで食材を絞り込む（どちらも未指定なら空配列）。名前順。 */
export function filterFoodItems(foodItems: FoodItem[], { query, category }: { query: string; category: string }): FoodItem[] {
  const normalizedQuery = normalizeExerciseQuery(query)
  if (!normalizedQuery && !category) {
    return []
  }
  return foodItems
    .filter((item) => {
      if (category === UNCATEGORIZED_FOOD_FILTER && !isUncategorizedFoodCategory(item.category)) {
        return false
      }
      if (category && category !== UNCATEGORIZED_FOOD_FILTER && item.category !== category) {
        return false
      }
      if (normalizedQuery && !normalizeExerciseQuery(item.name).includes(normalizedQuery)) {
        return false
      }
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

/** 検索語・カテゴリで料理を絞り込む（未指定なら全件）。名前順。 */
export function filterDishes(dishes: DishWithDetails[], { query, category }: { query: string; category: string }): DishWithDetails[] {
  const normalizedQuery = normalizeExerciseQuery(query)
  return dishes
    .filter((dish) => {
      if (category && dish.category !== category) {
        return false
      }
      if (normalizedQuery && !normalizeExerciseQuery(dish.name).includes(normalizedQuery)) {
        return false
      }
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}
